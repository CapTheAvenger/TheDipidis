// app-past-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // ====================================
        // PAST META - Deck Analysis & Builder
        // ====================================
        
        /* Die Matchsumme aus der Leistungskachel. Sie stammt aus
           labs_tournament_decks.csv, die Matchup-Matrix darunter aus
           labs_tournament_matchups_*.csv. Beide Zahlen sind richtig,
           aber sie sind nicht dieselbe — siehe die Notiz an der Matrix. */
        let _pmMatchesGesamt = 0;
        let pastMetaAllData = [];
        let pastMetaDecks = [];
        let pastMetaTournaments = [];
        let pastMetaCurrentDeck = null;
        let pastMetaCurrentCards = [];
        let pastMetaFilteredCards = [];
        let pastMetaCurrentScope = null;
        let pastMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let pastMetaShowGridView = true; // Default: Grid View

        // ── Set-code → readable-name lookup ─────────────────────
        // The Past-Meta dropdown lists format eras as "SVI-ASC" /
        // "BRS-PRE" etc. — those are the boundary set codes of each
        // tournament-format block. New users have no chance with the
        // bare codes, so we expand them to "Scarlet & Violet → Ascended
        // Heroes". Add new sets as they enter rotation; the lookup falls
        // back to the bare code if the set isn't in the dict yet, so
        // there's never a missing-data crash.
        const _PAST_META_SET_NAMES = {
            // Scarlet & Violet era
            'SVI': 'Scarlet & Violet',
            'PAL': 'Paldea Evolved',
            'OBF': 'Obsidian Flames',
            'MEW': '151',
            'PAR': 'Paradox Rift',
            'PAF': 'Paldean Fates',
            'TEF': 'Temporal Forces',
            'TWM': 'Twilight Masquerade',
            'SFA': 'Shrouded Fable',
            'SCR': 'Stellar Crown',
            'SSP': 'Surging Sparks',
            'PRE': 'Prismatic Evolutions',
            'JTG': 'Journey Together',
            'DRI': 'Destined Rivals',
            'BLK': 'Black Bolt',
            'WHT': 'White Flare',
            'MEG': 'Mega Evolution',
            'MEE': 'Mega Evolution Energies',
            'MEP': 'Mega Evolution Promos',
            'PFL': 'Phantasmal Flames',
            'POR': 'Perfect Order',
            'ASC': 'Ascended Heroes',
            'CRI': 'Chaos Rising',
            // SwSh era — last few blocks people still ask about
            'BRS': 'Brilliant Stars',
            'ASR': 'Astral Radiance',
            'PGO': 'Pokémon GO',
            'LOR': 'Lost Origin',
            'SIT': 'Silver Tempest',
            'CRZ': 'Crown Zenith',
            'BST': 'Battle Styles',
            'CRE': 'Chilling Reign',
            'EVS': 'Evolving Skies',
            'FST': 'Fusion Strike',
        };

        function expandPastMetaCode(code) {
            // "SVI-ASC" → "Scarlet & Violet → Ascended Heroes"
            // "POR"     → "Perfect Order"
            // Unknown   → returns the code unchanged.
            if (!code || typeof code !== 'string') return code || '';
            const parts = code.split('-').map(p => p.trim()).filter(Boolean);
            if (!parts.length) return code;
            const expanded = parts.map(p => _PAST_META_SET_NAMES[p.toUpperCase()] || p);
            return expanded.join(' → ');
        }

        function sanitizePastMetaArchetypeName(value) {
            const raw = String(value || '').trim();
            if (!raw) return 'Unknown Deck';

            // Remove trailing price artifacts such as "58.60$41.80€" from scraped deck labels.
            return raw
                .replace(/\s*\d+[.,]\d+\$\d+[.,]\d+€\s*$/u, '')
                .replace(/\s*\d+[.,]\d+€\s*$/u, '')
                .trim() || 'Unknown Deck';
        }

        function resetSelectWithPlaceholder(selectEl, placeholderText, placeholderValue, placeholderI18nKey) {
            if (!selectEl) return;
            selectEl.innerHTML = '';
            const placeholderOption = document.createElement('option');
            placeholderOption.value = placeholderValue;
            placeholderOption.textContent = placeholderText;
            // Tag with the i18n key so updateTranslationsInDOM keeps the
            // placeholder text in sync after a language toggle. Without
            // this the option text is frozen at the language active when
            // the dropdown was first populated, and the searchable-select
            // display (which mirrors options[0].textContent) shows German
            // strings in EN mode and vice versa.
            if (placeholderI18nKey) {
                placeholderOption.setAttribute('data-i18n', placeholderI18nKey);
            }
            selectEl.appendChild(placeholderOption);
        }

        /* WAEHREND DES LADENS SIEHT MAN, DASS GELADEN WIRD (03.09.2026).
         *
         * Gemeldet: "wenn ich in Rotationen auf alle Turniere dauert es
         * etwas bis wirklich alle Turniere im Turnier-Filter geladen sind.
         * Das ist natuerlich voll okay, aber wir sollten irgendwie anzeigen,
         * dass hier gerade noch was geladen wird."
         *
         * Der Fehler war nicht die Dauer, sondern die Stille: `-- Alle
         * Formate --` laedt 13 Auszuege nacheinander, und bis der letzte
         * durch ist, steht im Turnier-Filter die Liste des vorherigen
         * Formats. Sie sieht fertig aus. Wer sein Turnier darin nicht
         * findet, schliesst daraus, dass es fehlt.
         *
         * Drei Dinge zugleich, damit es an jeder Stelle auffaellt, an der
         * man hinsieht: die beiden Auswahlfelder werden gesperrt und
         * beschriftet, und darunter steht der Fortschritt in Zahlen. Die
         * Zahlen sind wichtig — "laedt ..." ohne Ende sieht nach Haenger
         * aus, "3 von 13" nicht.
         */
        function pastMetaLadestand(zustand, fertig, gesamt) {
            const zeile = document.getElementById('pastMetaLadestand');
            const format = document.getElementById('pastMetaFormatFilter');
            const turnier = document.getElementById('pastMetaTournamentFilter');
            const deck = document.getElementById('pastMetaDeckSelect');
            const anzeige = deck && deck.parentElement
                && deck.parentElement.querySelector('.searchable-select-display');

            /* AUCH DAS FORMATFELD WIRD GESPERRT. Nicht aus Vorsicht,
               sondern weil ein zweiter Wechsel waehrend des Ladens einen
               zweiten Lauf startet: `pastMetaDecks` wuerde zweimal
               ergaenzt, und das `finally` des ERSTEN Laufs raeumt die
               Anzeige weg, waehrend der zweite noch laeuft. Dann steht
               wieder eine halbfertige Liste da, die fertig aussieht —
               genau der Zustand, den diese Anzeige beheben soll. */
            const felder = [format, turnier, deck];

            if (zustand === 'aus') {
                if (zeile) { zeile.hidden = true; zeile.textContent = ''; }
                felder.forEach((el) => {
                    if (!el) return;
                    el.disabled = false;
                    el.classList.remove('pm-laedt');
                });
                // Das durchsuchbare Feld spiegelt das native <select> nicht
                // von selbst — es baut sich beim naechsten Fuellen neu auf.
                if (anzeige) {
                    anzeige.classList.remove('pm-laedt');
                    anzeige.removeAttribute('aria-disabled');
                    anzeige.tabIndex = 0;
                }
                return;
            }

            const mit = (schluessel, ersatz) => (gesamt > 1)
                ? t(schluessel).replace('{n}', String(fertig || 0)).replace('{g}', String(gesamt))
                : t(ersatz);
            if (zeile) { zeile.hidden = false; zeile.textContent = mit('pm.ladeFortschritt', 'pm.ladeEinzeln'); }
            felder.forEach((el) => {
                if (!el) return;
                el.disabled = true;
                el.classList.add('pm-laedt');
            });
            if (anzeige) {
                anzeige.classList.add('pm-laedt');
                /* GEMESSEN, NICHT ANGENOMMEN (03.09.2026): `disabled` auf
                   dem versteckten <select> haelt das durchsuchbare Feld
                   NICHT auf — es ist ein <div>. Der Probelauf klappte es
                   waehrend des Ladens auf und sah die halb gefuellte
                   Deckliste, die vollstaendig aussieht. Genau der Zustand,
                   den diese Anzeige verhindern soll, eine Spalte weiter.
                   Also Maus (pointer-events, im Stylesheet) UND Tastatur
                   (tabIndex) zumachen. */
                anzeige.setAttribute('aria-disabled', 'true');
                anzeige.tabIndex = -1;
                // Eigener Satz: unter der Ueberschrift "Archetyp auswaehlen"
                // ist "Turniere werden geladen" die Antwort auf eine Frage,
                // die dort niemand gestellt hat.
                anzeige.textContent = mit('pm.ladeDecks', 'pm.ladeDecksEinzeln');
            }
        }

        // (2026-06-10 audit) Delegated to window.parseLocaleNumber —
        // see app-utils.js. Keeping the named export as a thin alias so
        // existing call sites (parsePastMetaNumber) keep working without
        // a 30-file find-and-replace.
        const parsePastMetaNumber = (value, fallback = 0) =>
            window.parseLocaleNumber(value, fallback);

        /**
         * Eine Zahl nur dann uebernehmen, wenn das Feld auch wie eine Zahl
         * aussieht.
         *
         * data/tournament_cards_data_cards_TEF-CRI.csv ist zu 46,1 %
         * fehlerhaft geschrieben (1.263 von 2.737 Zeilen, alle aus Turnier
         * 540): ein Python-Listen-Text ist in die Zeile geraten und
         * zerreisst drei Spalten. Aus average_count wird `4,"['0`, aus
         * percentage_in_archetype `100', '0`, aus is_ace_spec `No']"`.
         *
         * parseLocaleNumber liest davon den Ganzzahlteil und liefert eine
         * Zahl, die groesser als 0 ist — die Anzeige haelt sie deshalb fuer
         * gueltig und rechnet NICHT neu. Angezeigt wurden dadurch bis zu
         * 309 falsche Durchschnitts-Kopienzahlen (max. 0,97 daneben).
         *
         * Die uebrigen Spalten derselben Zeile (total_count,
         * deck_inclusion_count, total_decks_in_archetype) sind unversehrt,
         * und aus ihnen rechnet die Aggregation beide Werte ohnehin neu.
         * Es genuegt also, den zerrissenen Wert als FEHLEND zu behandeln
         * statt als Zahl. Nichts wird geraten, nur nichts Falsches gezeigt.
         *
         * Behoben gehoert das im Schreibweg — backend prueft seine Ausgabe
         * seit dem 20.08.2026 gegen dieselbe Form.
         *
         * NACHTRAG 21.08.2026: die Datei ist repariert. Die 1.263 Zeilen
         * wurden aus den unversehrten Spalten derselben Zeile nachgerechnet
         * (scripts/repariere_turnier_kartenzeilen.py), is_ace_spec blieb
         * leer statt geraten. Diese Pruefung hier bleibt trotzdem stehen:
         * sie kostet nichts und faengt den naechsten Schreibfehler ab,
         * bevor er als Zahl auf dem Schirm landet. Ein Netz nimmt man
         * nicht weg, weil gerade niemand faellt.
         */
        const PM_ZAHL_FORM = /^\s*-?\d+(?:[.,]\d+)?\s*$/;
        function pastMetaZahlFeld(value, fallback = null) {
            if (value == null || value === '') return fallback;
            if (typeof value === 'number') return isFinite(value) ? value : fallback;
            if (!PM_ZAHL_FORM.test(String(value))) return fallback;
            return window.parseLocaleNumber(value, fallback == null ? 0 : fallback);
        }

        function normalizeCardAggregationKey(name) {
            if (typeof normalizeCardName === 'function') {
                return normalizeCardName(name);
            }

            return String(name || '')
                .toLowerCase()
                .replace(/[\u2019'`]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function parsePastMetaDateMs(dateValue) {
            if (!dateValue) return 0;
            const raw = String(dateValue).trim();
            if (!raw) return 0;

            const direct = new Date(raw);
            if (!Number.isNaN(direct.getTime())) {
                return direct.getTime();
            }

            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const fallback = new Date(cleaned);
            if (!Number.isNaN(fallback.getTime())) {
                return fallback.getTime();
            }

            return 0;
        }

        function getPastMetaSortScore(metaName, setOrderMap, latestDateMap) {
            const normalizedMeta = String(metaName || '').trim().toUpperCase();
            if (!normalizedMeta) return 0;

            const parts = normalizedMeta.split('-').map(p => p.trim()).filter(Boolean);
            const firstSet = parts[0] || '';
            const lastSet = parts[parts.length - 1] || '';
            const firstOrder = setOrderMap[firstSet] || 0;
            const lastOrder = setOrderMap[lastSet] || 0;
            const dateMs = latestDateMap.get(String(metaName || '').trim()) || 0;

            // Primary sort by ending-set recency (e.g. SVI-ASC > SVI-PFL), fallback by latest tournament date.
            if (lastOrder > 0 || firstOrder > 0) {
                return (lastOrder * 1000000) + (firstOrder * 1000) + Math.floor(dateMs / 1000000000);
            }

            return dateMs;
        }

        function derivePastMetaLabelFromSetCode(setCode, setOrderMap) {
            const code = String(setCode || '').trim().toUpperCase();
            if (!code) return '';
            const mapped = mapSetCodeToMetaFormat(code);
            return mapped || code;
        }

        function getPastMetaDeckTournamentKey(deck) {
            const tournamentId = String(deck?.tournament_id || '').trim();
            const tournamentName = String(deck?.tournament_name || '').trim();
            const tournamentDate = String(deck?.tournament_date || '').trim();
            const format = String(deck?.format || '').trim();

            if (tournamentId) return `id:${tournamentId}`;
            if (tournamentName && tournamentDate) return `${format}|||${tournamentDate}|||${tournamentName}`;
            if (tournamentDate) return `${format}|||${tournamentDate}`;
            if (tournamentName) return `${format}|||${tournamentName}`;
            return format || 'unknown';
        }

        function getPastMetaRepresentativeCardCopies(card) {
            const avgOverall = parsePastMetaNumber(card?.card_count ?? card?.average_count_overall, 0);
            const maxCount = parseInt(card?.max_count || 0, 10) || 0;
            const deckCount = parseInt(card?.deck_count || card?.deck_inclusion_count || 0, 10) || 0;

            if (!pastMetaCurrentScope || pastMetaCurrentScope.totalDecklists <= 1) {
                return maxCount;
            }

            if (avgOverall > 0) {
                return avgOverall;
            }

            if (deckCount > 0) {
                return 1;
            }

            return maxCount;
        }

        function getPastMetaDisplayCount(card) {
            const representativeCopies = getPastMetaRepresentativeCardCopies(card);
            const maxCount = parseInt(card?.max_count || 0, 10) || 0;

            if (!pastMetaCurrentScope || pastMetaCurrentScope.totalDecklists <= 1) {
                return maxCount;
            }

            if (representativeCopies > 0) {
                return Math.max(1, Math.round(representativeCopies));
            }

            return maxCount;
        }

        function getPastMetaSummaryTotalCount(cards) {
            if (!Array.isArray(cards) || cards.length === 0) return 0;

            // Die Summe darf NICHT die Anzeigewerte der einzelnen Karten
            // addieren.
            //
            // getPastMetaDisplayCount hebt jede Karte auf mindestens eine
            // Kopie — richtig fuer das Kaertchen, weil eine Karte, die in
            // 0,3 % der Listen steht, im Gitter nicht als "0" dastehen soll.
            // Aufsummiert wird daraus aber eine Deckgroesse, die es nicht
            // geben kann: Dragapult in TEF-CRI hat 89 verschiedene Karten,
            // 65 davon mit einem echten Mittelwert unter 0,5 Kopien, und die
            // Kachel meldete deshalb 124 Karten fuer ein 60-Karten-Deck.
            // Gemessen ueber die grossen Archetypen: 75 bis 135.
            //
            // Die ungerundeten Mittelwerte summieren sich auf 60,03 — das ist
            // die Zahl, die die Kachel meint. Der Boden bleibt auf der
            // einzelnen Karte, wo er hingehoert.
            //
            // Auch der zweite Boden aus getPastMetaRepresentativeCardCopies
            // darf hier nicht mitlaufen: 16 der 89 Karten haben in diesem
            // Chunk einen Mittelwert von exakt 0 (total_count fehlt), und der
            // Helfer gibt fuer sie "1 Kopie" zurueck, weil sie in Listen
            // vorkommen. Fuer das Kaertchen ist das richtig, fuer die Summe
            // waeren es 16 erfundene Karten — 76 statt 60.
            //
            // Bei einer Auswahl aus einer einzigen Liste gibt es keinen
            // Mittelwert; dort ist max_count die echte Kopienzahl, und die
            // Summe darueber ergibt wieder 60.
            if (!pastMetaCurrentScope || pastMetaCurrentScope.totalDecklists <= 1) {
                return cards.reduce(
                    (sum, card) => sum + (parseInt(card?.max_count || 0, 10) || 0), 0);
            }
            return cards.reduce((sum, card) => {
                const avg = parsePastMetaNumber(card?.card_count ?? card?.average_count_overall, 0);
                return sum + (avg > 0 ? avg : 0);
            }, 0);
        }
        
        async function loadPastMeta() {
          try {
            devLog('Loading Past Meta Deck Analysis...');
            const pastMetaGrid = document.getElementById('pastMetaDeckGrid');
            if (pastMetaGrid && !pastMetaGrid.innerHTML.trim()) {
                showTableSkeleton(pastMetaGrid, { rows: 6, cols: 4, withImage: true });
            }
            showToast(t('pm.toastLoading'), 'info');
            
            // Phase 1: Load lightweight overview CSV (24KB) for tournament/format dropdowns
            const tournamentOverview = await loadCSV('tournament_cards_data_overview.csv');
            
            // Store tournament overview data — exclude Expanded (only Standard is scraped)
            pastMetaTournaments = (tournamentOverview || []).filter(t => String(t.format || '').trim().toLowerCase() !== 'expanded');

            // Build tournament lookup index (by date) for fast matching later
            const tournamentsByDate = new Map();
            pastMetaTournaments.forEach(t => {
                const date = String(t.tournament_date || '').trim();
                if (!date) return;
                if (!tournamentsByDate.has(date)) tournamentsByDate.set(date, []);
                tournamentsByDate.get(date).push(t);
            });

            // Load dynamic set order map for proper meta sorting (newest -> oldest)
            let pastMetaSetOrderMap = {};
            try {
                const ts = Date.now();
                const setOrderResponse = await fetch(`./data/sets.json?t=${ts}`);
                if (setOrderResponse.ok) {
                    const json = await setOrderResponse.json();
                    if (json && typeof json === 'object') {
                        pastMetaSetOrderMap = json;
                    }
                }
            } catch (e) {
                console.warn('[Past Meta] Could not load sets.json for format sorting, using date fallback.', e);
            }
            // Store for later use in lazy card loading
            window._pastMetaSetOrderMap = pastMetaSetOrderMap;
            window._pastMetaTournamentsByDate = tournamentsByDate;

            // Phase 2: Load manifest for lazy per-format chunk loading
            let pastMetaManifest = null;
            try {
                const manifestResp = await fetch(BASE_PATH + 'tournament_cards_manifest.json?t=' + Date.now());
                if (manifestResp.ok) pastMetaManifest = await manifestResp.json();
            } catch (e) { /* ignore */ }
            window._pastMetaManifest = pastMetaManifest;
            window._pastMetaLoadedChunks = new Set();

            // Populate Format Filter from manifest meta_keys (no full data load yet)
            const formatSelect = document.getElementById('pastMetaFormatFilter');
            resetSelectWithPlaceholder(formatSelect, t('pm.allFormats'), 'all');
            let defaultFormat = 'all';

            if (pastMetaManifest && Array.isArray(pastMetaManifest.meta_keys) && pastMetaManifest.meta_keys.length > 0) {
                const sortedKeys = [...pastMetaManifest.meta_keys].sort((a, b) => {
                    const scoreA = getPastMetaSortScore(a, pastMetaSetOrderMap, new Map());
                    const scoreB = getPastMetaSortScore(b, pastMetaSetOrderMap, new Map());
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    return a.localeCompare(b);
                });
                sortedKeys.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key;
                    // Show the readable block name (e.g. "Scarlet & Violet →
                    // Ascended Heroes") with the bare code as a small suffix
                    // so power-users still see the format key. Tooltip carries
                    // the code on its own for screen-reader / hover-clarity.
                    const expanded = expandPastMetaCode(key);
                    option.textContent = (expanded && expanded !== key)
                        ? `${expanded} (${key})`
                        : key;
                    option.title = `Format code: ${key}`;
                    formatSelect.appendChild(option);
                });
                // Default to newest format for fast initial load (~17MB instead of ~100MB)
                defaultFormat = sortedKeys[0];
                formatSelect.value = defaultFormat;
                /* BEFUND DER ABNAHME (02.09.2026): 60 px unter diesem
                   Auswahlfeld baut ds-filter.js eine Knopfleiste, die
                   denselben Wert zeigen soll. Sie liest ihn einmal beim
                   Bauen und horcht danach auf `change` — eine Zuweisung
                   per JavaScript loest aber kein `change` aus. Folge:
                   die Leiste sagte "-- Alle Formate --", waehrend das
                   Feld darueber "Temporal Forces -> PBL" stand und
                   geladen wurde. Zwei Angaben zum selben Zeitraum,
                   nebeneinander, verschieden. */
                formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Load only the selected format's chunk (lazy)
            pastMetaDecks = [];
            await _loadPastMetaChunksIfNeeded(defaultFormat, pastMetaSetOrderMap, tournamentsByDate);

            console.log(`[Past Meta] After chunk load: ${pastMetaDecks.length} decks for format "${defaultFormat}"`);

            if (pastMetaDecks.length === 0) {
                showToast(t('toast.noPastDataFor') + defaultFormat, 'error');
                console.error('[Past Meta] No decks found in tournament CSV — chunk may have failed to parse');
                // Surface the failure in the UI so the user isn't staring
                // at an empty "Select a Deck" dropdown wondering what's
                // wrong. Also still wires up event listeners so they can
                // try a different format manually.
                const deckGrid = document.getElementById('pastMetaDeckGrid');
                if (deckGrid) {
                    deckGrid.innerHTML = `<div style="padding:24px;text-align:center;color:#c0392b;font-weight:600;">
                        Konnten keine Decks für ${defaultFormat} laden.<br>
                        <span style="font-weight:400;color:#666;font-size:0.9em;">
                            Versuche oben ein anderes Format auszuwählen oder die Seite neu zu laden.
                        </span>
                    </div>`;
                }
                // Still register format change so user can switch
                formatSelect.addEventListener('change', async () => {
                    const format = formatSelect.value;
                    pastMetaLadestand('an', 0, 0);
                    try {
                        await _loadPastMetaChunksIfNeeded(format, window._pastMetaSetOrderMap,
                            window._pastMetaTournamentsByDate,
                            (n, g) => pastMetaLadestand('an', n, g));
                    } finally {
                        // IMMER wieder freigeben. Bricht ein Auszug ab, waeren
                        // die beiden Felder sonst dauerhaft gesperrt — aus
                        // "es laedt noch" wuerde "es geht nichts mehr".
                        pastMetaLadestand('aus');
                    }
                    updatePastMetaTournamentFilter();
                    updatePastMetaDeckList();
                });
                // Wire up the deck select even with no data so iOS doesn't
                // pop its native picker on top of the empty placeholder.
                const deckSelectEarly = document.getElementById('pastMetaDeckSelect');
                if (deckSelectEarly && typeof initSearchableSelect === 'function') {
                    initSearchableSelect(deckSelectEarly);
                }
                return;
            }
            
            // Populate Tournament Filter (will be updated dynamically)
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            
            // Setup event listeners - Format filter triggers lazy chunk load + update
            formatSelect.addEventListener('change', async () => {
                const format = formatSelect.value;
                pastMetaLadestand('an', 0, 0);
                try {
                    await _loadPastMetaChunksIfNeeded(format, window._pastMetaSetOrderMap,
                        window._pastMetaTournamentsByDate,
                        (n, g) => pastMetaLadestand('an', n, g));
                } finally {
                    pastMetaLadestand('aus');
                }
                updatePastMetaTournamentFilter();
                updatePastMetaDeckList();
            });
            tournamentSelect.addEventListener('change', updatePastMetaDeckList);
            document.getElementById('pastMetaDeckSelect').addEventListener('change', onPastMetaDeckSelect);
            document.getElementById('pastMetaFilterSelect').addEventListener('change', filterPastMetaCards);
            
            // Initial population
            updatePastMetaTournamentFilter();
            updatePastMetaDeckList();
            
            // Initialize rarity mode button styling
            setPastMetaRarityMode('min');
            
            const tournamentCount = [...new Set(pastMetaDecks.map(d => d.tournament_id))].length;
            devLog(`Loaded ${pastMetaDecks.length} decks from ${tournamentCount} tournaments (lazy card loading)`);
            showToast(t('pm.toastLoaded').replace('{n}', zahlLokal(pastMetaDecks.length)), 'success');
            window.pastMetaLoaded = true;
          } catch (err) {
            console.error('[Past Meta] loadPastMeta failed:', err);
            showToast(t('toast.pastMetaLoadError') + (err.message || err), 'error');
          }
        }
        
        // Lazy-load tournament chunks for a specific format (or all formats).
        // Appends new decks to pastMetaDecks without duplicating already-loaded data.
        async function _loadPastMetaChunksIfNeeded(format, setOrderMap, tournamentsByDate, onFortschritt) {
            const manifest = window._pastMetaManifest;
            const loaded = window._pastMetaLoadedChunks || new Set();

            if (!manifest || !Array.isArray(manifest.chunks)) {
                // No manifest — fall back to full monolith load (once)
                if (!loaded.has('__all__')) {
                    const deckIndex = await streamPastMetaDeckIndex(setOrderMap, tournamentsByDate, null, onFortschritt);
                    pastMetaDecks = Array.from(deckIndex.values());
                    loaded.add('__all__');
                }
                return;
            }

            let chunksToLoad = [];
            if (format === 'all') {
                manifest.meta_keys.forEach((key, i) => {
                    if (!loaded.has(key)) chunksToLoad.push({ key, file: manifest.chunks[i] });
                });
            } else {
                const idx = manifest.meta_keys.indexOf(format);
                if (idx >= 0 && !loaded.has(format)) {
                    chunksToLoad.push({ key: format, file: manifest.chunks[idx] });
                }
            }

            if (chunksToLoad.length === 0) return; // Already loaded

            const chunkUrls = chunksToLoad.map(c => BASE_PATH + c.file);
            devLog(`[Past Meta] Lazy-loading ${chunkUrls.length} chunk(s) for format: ${format}`);
            const deckIndex = await streamPastMetaDeckIndex(setOrderMap, tournamentsByDate, chunkUrls, onFortschritt);
            const newDecks = Array.from(deckIndex.values());
            pastMetaDecks = pastMetaDecks.concat(newDecks);

            chunksToLoad.forEach(c => loaded.add(c.key));
            window._pastMetaLoadedChunks = loaded;
            devLog(`[Past Meta] Now ${pastMetaDecks.length} total decks loaded (${loaded.size} chunks)`);
        }

        // Stream-parse the large cards CSV to build the deck index AND store cards per deck.
        // Uses PapaParse streaming so PapaParse never holds all 429k rows internally.
        // Prefers chunked files via tournament_cards_manifest.json when available.
        // Optional chunkUrls: array of specific chunk URLs to load (for lazy per-format loading).
        function streamPastMetaDeckIndex(setOrderMap, tournamentsByDate, chunkUrls, onFortschritt) {
            return new Promise(async (resolve, reject) => {
                const deckMap = new Map();
                const inferredMeta = new Map(); // deckKey → newest set code

                // Shared row handler (same logic for monolith and chunks)
                function processRow(card) {
                    if (!card) return;
                    
                    const meta = String(card.meta || '').trim();
                    if (meta.toLowerCase() === 'expanded') return;
                    
                    const rawArchetype = String(card.archetype || '').trim();
                    const deckArchetype = sanitizePastMetaArchetypeName(rawArchetype);
                    if (!deckArchetype || deckArchetype === 'Unknown Deck') return;
                    
                    const tournamentDate = String(card.tournament_date || '').trim() || 'Unknown Date';
                    const cardTournamentId = String(card.tournament_id || '').trim();
                    const cardTournamentName = String(card.tournament_name || '').trim();
                    const setCode = String(card.set_code || '').trim().toUpperCase();
                    
                    // Infer format from newest set code
                    const deckPeriodKey = cardTournamentId || tournamentDate;
                    const metaLookupKey = `${deckPeriodKey}|||${rawArchetype}`;
                    if (setCode) {
                        const nextOrder = setOrderMap[setCode] || 0;
                        const currentCode = inferredMeta.get(metaLookupKey);
                        const currentOrder = currentCode ? (setOrderMap[currentCode] || 0) : -1;
                        if (nextOrder > currentOrder) {
                            inferredMeta.set(metaLookupKey, setCode);
                        }
                    }
                    
                    // Match tournament from overview (indexed by date)
                    const candidates = tournamentsByDate.get(tournamentDate) || [];
                    let tournament = null;
                    if (candidates.length === 1) {
                        tournament = candidates[0];
                    } else if (candidates.length > 1) {
                        tournament = candidates.find(t => {
                            const overviewFormat = String(t.format || '').trim();
                            return !meta || !overviewFormat || overviewFormat === meta;
                        }) || null;
                    }
                    
                    const inferredMetaSetCode = inferredMeta.get(metaLookupKey) || '';
                    const inferredMetaLabel = derivePastMetaLabelFromSetCode(inferredMetaSetCode, setOrderMap);
                    
                    const resolvedFormat = meta
                        || String((tournament && tournament.format) || '').trim()
                        || inferredMetaLabel
                        || 'Unknown';
                    const resolvedTournamentId = cardTournamentId || String((tournament && tournament.tournament_id) || '').trim() || tournamentDate;
                    const resolvedTournamentName = cardTournamentName || String((tournament && tournament.tournament_name) || '').trim() || tournamentDate;
                    const deckKey = `${resolvedFormat}|||${resolvedTournamentId}|||${deckArchetype}`;
                    
                    if (!deckMap.has(deckKey)) {
                        deckMap.set(deckKey, {
                            key: deckKey,
                            tournament_id: resolvedTournamentId,
                            tournament_name: resolvedTournamentName,
                            tournament_date: tournamentDate,
                            deck_name: deckArchetype,
                            archetype: deckArchetype,
                            format: resolvedFormat,
                            decklist_count: parseInt(card.total_decks_in_archetype || 1),
                            _rawArchetypes: new Set([rawArchetype]),
                            cards: []
                        });
                    } else {
                        const existing = deckMap.get(deckKey);
                        const rowDecklistCount = parseInt(card.total_decks_in_archetype || 1);
                        existing.decklist_count = Math.max(existing.decklist_count, rowDecklistCount);
                        existing._rawArchetypes.add(rawArchetype);
                    }
                    
                    // Store card data directly in the deck
                    // Zerrissene Felder kommen als leerer String durch, nicht
                    // als Zahl — die Aggregation rechnet sie dann aus den
                    // unversehrten Spalten neu, statt einen halben Wert zu
                    // zeigen. Siehe pastMetaZahlFeld.
                    const zerrissen = (v) => {
                        const z = pastMetaZahlFeld(v, null);
                        return z == null ? '' : z;
                    };
                    deckMap.get(deckKey).cards.push({
                        ...card,
                        total_count: parsePastMetaNumber(card.total_count, 0),
                        card_count: parsePastMetaNumber(card.average_count_overall, 0),
                        average_count: zerrissen(card.average_count),
                        average_count_overall: parsePastMetaNumber(card.average_count_overall, 0),
                        percentage_in_archetype: zerrissen(card.percentage_in_archetype),
                        is_ace_spec: /^(yes|true|1)$/i.test(String(card.is_ace_spec || '').trim()),
                        decklist_count: parseInt(card.total_decks_in_archetype || 1, 10) || 1,
                        deck_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                        deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0
                    });
                }

                function finalize() {
                    deckMap.forEach(deck => {
                        if (deck._rawArchetypes && deck._rawArchetypes.size > deck.decklist_count) {
                            deck.decklist_count = deck._rawArchetypes.size;
                        }
                        delete deck._rawArchetypes;
                    });
                    devLog(`[Past Meta] Streamed deck index: ${deckMap.size} unique decks`);
                    resolve(deckMap);
                }

                // Helper: stream-parse a single CSV file
                function streamFile(url) {
                    return new Promise((res, rej) => {
                        Papa.parse(url, {
                            download: true,
                            header: true,
                            delimiter: ';',
                            worker: false,
                            skipEmptyLines: true,
                            step: function(result) { processRow(result.data); },
                            complete: function() { res(); },
                            error: function(err) { rej(err); }
                        });
                    });
                }

                try {
                    if (chunkUrls && chunkUrls.length > 0) {
                        // Lazy: load only the specified chunk files
                        devLog(`[Past Meta] Loading ${chunkUrls.length} specified chunk(s)`);
                        let fertig = 0;
                        if (typeof onFortschritt === 'function') onFortschritt(0, chunkUrls.length);
                        for (const url of chunkUrls) {
                            await streamFile(url);
                            fertig++;
                            if (typeof onFortschritt === 'function') onFortschritt(fertig, chunkUrls.length);
                        }
                    } else {
                        // Full load: try chunked loading via manifest, else monolith
                        let useChunks = false;
                        try {
                            const manifestResp = await fetch(BASE_PATH + 'tournament_cards_manifest.json');
                            if (manifestResp.ok) {
                                const manifest = await manifestResp.json();
                                if (manifest && Array.isArray(manifest.chunks) && manifest.chunks.length > 0) {
                                    devLog(`[Past Meta] Loading ${manifest.chunks.length} tournament chunks`);
                                    let fertigM = 0;
                                    if (typeof onFortschritt === 'function') onFortschritt(0, manifest.chunks.length);
                                    for (const chunkFile of manifest.chunks) {
                                        await streamFile(BASE_PATH + chunkFile);
                                        fertigM++;
                                        if (typeof onFortschritt === 'function') onFortschritt(fertigM, manifest.chunks.length);
                                    }
                                    useChunks = true;
                                }
                            }
                        } catch (e) {
                            console.warn('[Past Meta] Manifest not available, using monolith:', e);
                        }

                        // Fallback: stream the single monolith file
                        if (!useChunks) {
                            await streamFile(BASE_PATH + 'tournament_cards_data_cards.csv');
                        }
                    }

                    finalize();
                } catch (err) {
                    console.error('[Past Meta] Stream parse error:', err);
                    reject(err);
                }
            });
        }
        
        function updatePastMetaTournamentFilter() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentSelect = document.getElementById('pastMetaTournamentFilter');
            const previousSelection = tournamentSelect ? tournamentSelect.value : 'all';
            
            // Filter decks by selected format to get relevant tournaments
            let filteredDecks = pastMetaDecks;
            if (formatFilter !== 'all') {
                filteredDecks = pastMetaDecks.filter(deck => deck.format === formatFilter);
            }
            
            // Get unique tournament IDs from filtered decks
            const tournamentIds = [...new Set(filteredDecks.map(d => d.tournament_id))];
            
            // Get tournament details from pastMetaTournaments
            const tournaments = tournamentIds
                .map(id => pastMetaTournaments.find(t => t.tournament_id === id))
                .filter(t => t) // Remove undefined entries
                .sort((a, b) => {
                    // Sort by date (newest first); use parser that handles "14th March 2026" ordinal format
                    const dateA = parsePastMetaDateMs(a.tournament_date);
                    const dateB = parsePastMetaDateMs(b.tournament_date);
                    return dateB - dateA;
                });
            
            // Rebuild tournament filter dropdown
            resetSelectWithPlaceholder(tournamentSelect, t('pm.allTournaments'), 'all');
            tournaments.forEach(tournament => {
                // Clean tournament name: remove " - Limitless"
                let cleanName = tournament.tournament_name.replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                const option = document.createElement('option');
                option.value = String(tournament.tournament_id || '');
                option.textContent = cleanName;
                tournamentSelect.appendChild(option);
            });

            if (tournamentSelect) {
                const canRestore = Array.from(tournamentSelect.options).some(opt => opt.value === previousSelection);
                tournamentSelect.value = canRestore ? previousSelection : 'all';
            }
            
            devLog(`[Past Meta] Tournament filter updated: ${tournaments.length} tournaments for format ${formatFilter}`);
        }
        
        function updatePastMetaDeckList() {
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            const deckSelect = document.getElementById('pastMetaDeckSelect');
            const previousSelection = deckSelect ? deckSelect.value : '';
            
            // Filter decks
            let filteredDecks = pastMetaDecks.filter(deck => {
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                return matchesFormat && matchesTournament;
            });
            
            // Group by archetype (deck_name) to merge across tournaments
            const archetypeMap = new Map();
            filteredDecks.forEach(deck => {
                const archetype = deck.deck_name || 'Unknown';
                if (!archetypeMap.has(archetype)) {
                    archetypeMap.set(archetype, {
                        archetype: archetype,
                        tournaments: [],
                        totalDecklists: 0
                    });
                }
                const entry = archetypeMap.get(archetype);
                entry.tournaments.push(deck);
                entry.totalDecklists += (deck.decklist_count || 0);
            });
            
            // Convert to array and sort by archetype name
            const archetypes = Array.from(archetypeMap.values());
            archetypes.sort((a, b) => a.archetype.localeCompare(b.archetype));
            
            // Populate deck select dropdown
            resetSelectWithPlaceholder(deckSelect, typeof t === 'function' ? t('currentMeta.selectDeck') : '-- Select a Deck --', '', 'currentMeta.selectDeck');
            
            archetypes.forEach(entry => {
                const tournamentCount = entry.tournaments.length;
                const displayName = tournamentCount > 1
                    ? `${entry.archetype} ${t('pm.tournamentsSuffix').replace('{n}', tournamentCount)}`
                    : entry.archetype;
                const option = document.createElement('option');
                option.value = entry.archetype;
                option.textContent = displayName;
                deckSelect.appendChild(option);
            });

            if (deckSelect) {
                const canRestore = Array.from(deckSelect.options).some(opt => opt.value === previousSelection);
                if (canRestore) {
                    deckSelect.value = previousSelection;
                } else if (deckSelect.options.length > 1) {
                    deckSelect.value = deckSelect.options[1].value;
                } else {
                    deckSelect.value = '';
                }

                if (deckSelect.value) {
                    onPastMetaDeckSelect();
                } else {
                    pastMetaCurrentDeck = null;
                    pastMetaCurrentCards = [];
                    pastMetaFilteredCards = [];
                    renderPastMetaCards();
                }
            }
            
            devLog(`Filtered to ${archetypes.length} unique archetypes from ${filteredDecks.length} tournament entries`);

            // Convert native <select> to custom searchable dropdown
            if (deckSelect && typeof initSearchableSelect === 'function') initSearchableSelect(deckSelect);
        }
        
        function onPastMetaDeckSelect() {
            const selectedArchetype = document.getElementById('pastMetaDeckSelect').value;
            
            if (!selectedArchetype) {
                // Hide stats and cards
                document.getElementById('pastMetaStatsSection').classList.add('d-none');
                const perfSection = document.getElementById('pastMetaPerformanceSection');
                if (perfSection) perfSection.classList.add('d-none');
                document.getElementById('pastMetaDeckTableView').classList.add('d-none');
                document.getElementById('pastMetaDeckVisual').classList.add('d-none');
                pastMetaCurrentDeck = null;
                pastMetaCurrentCards = [];
                pastMetaFilteredCards = [];
                pastMetaCurrentScope = null;
                resetDeckOverviewCounts('pastMetaCardCount', 'pastMetaCardCountSummary', '0 ' + t('cl.cards'), '/ 0 ' + t('cl.total'));
                renderNoDeckSelectedState('pastMetaDeckGrid', 'Bitte wähle ein Deck aus dem Dropdown, um die Karten zu laden');
                return;
            }
            
            // Async wrapper for lazy card loading
            _loadPastMetaDeckCards(selectedArchetype);
        }
        
        async function _loadPastMetaDeckCards(selectedArchetype) {
          try {
            
            const formatFilter = document.getElementById('pastMetaFormatFilter').value;
            const tournamentFilter = document.getElementById('pastMetaTournamentFilter').value;
            
            // Find all decks with matching archetype (respecting current filters)
            const matchingDecks = pastMetaDecks.filter(deck => {
                const matchesArchetype = deck.deck_name === selectedArchetype;
                const matchesFormat = formatFilter === 'all' || deck.format === formatFilter;
                const matchesTournament = tournamentFilter === 'all' || deck.tournament_id === tournamentFilter;
                return matchesArchetype && matchesFormat && matchesTournament;
            });
            
            if (matchingDecks.length === 0) {
                console.error('No matching decks found for archetype:', selectedArchetype);
                return;
            }

            const uniqueTournamentKeys = new Set(matchingDecks.map(deck => getPastMetaDeckTournamentKey(deck)));
            const uniqueTournamentCount = uniqueTournamentKeys.size;
            
            // Aggregate cards across all matching decks (same statistical pipeline as City/Global)
            const selectedRows = [];
            let totalDecklists = 0;
            const tournamentNames = [];
            
            matchingDecks.forEach(deck => {
                totalDecklists += (deck.decklist_count || 0);
                
                // Track tournament names for stats display
                const cleanTournamentName = (deck.tournament_name || '').replace(/\s*[-|•]\s*Limitless\s*$/i, '');
                if (!tournamentNames.includes(cleanTournamentName)) {
                    tournamentNames.push(cleanTournamentName);
                }
                
                // Collect rows for unified aggregation (cards stored during initial stream)
                deck.cards.forEach(card => {
                    selectedRows.push({
                        ...card,
                        archetype: deck.deck_name || card.archetype || '',
                        tournament_id: deck.tournament_id || '',
                        tournament_date: deck.tournament_date || card.tournament_date || 'Unknown Date',
                        total_decks_in_archetype: deck.decklist_count || card.total_decks_in_archetype || 1,
                        deck_count: card.deck_count || card.deck_inclusion_count || 0,
                        deck_inclusion_count: card.deck_inclusion_count || card.deck_count || 0,
                        total_count: card.total_count || 0,
                        max_count: card.max_count || 0
                    });
                });
            });

            // Preserve raw per-tournament rows for Recency scoring in Consistency builder
            window.pastMetaRawDeckCards = selectedRows.slice();

            const aggregatedCardsRaw = aggregateCardStatsByDate(selectedRows).map(card => ({
                ...card,
                card_count: parsePastMetaNumber(card.average_count_overall, 0),
                decklist_count: parseInt(card.total_decks_in_archetype || totalDecklists || 1, 10) || 1,
                deck_inclusion_count: parseInt(card.deck_inclusion_count || card.deck_count || 0, 10) || 0,
                deck_count: parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0,
                max_count: parseInt(card.max_count || 0, 10) || 0
            }));
            const aggregatedCards = deduplicateCards(aggregatedCardsRaw);
            pastMetaCurrentScope = {
                format: formatFilter,
                tournamentFilter,
                totalDecklists,
                uniqueTournamentCount,
                selectedDeckEntryCount: matchingDecks.length,
                multiTournament: uniqueTournamentCount > 1
            };
            
            // Create a virtual deck object for the aggregated data
            pastMetaCurrentDeck = {
                deck_name: selectedArchetype,
                archetype: selectedArchetype,
                format: formatFilter === 'all' ? 'Multi-Format' : formatFilter,
                tournament_name: tournamentNames.join(', '),
                tournament_count: uniqueTournamentCount,
                decklist_count: totalDecklists,
                cards: aggregatedCards
            };
            
            pastMetaCurrentCards = aggregatedCards;
            
            // Update stats
            document.getElementById('pastMetaStatsSection').classList.remove('d-none');
            const totalCards = getPastMetaSummaryTotalCount(aggregatedCards);
            document.getElementById('pastMetaStatCards').textContent = `${aggregatedCards.length} / ${Math.round(totalCards)}`;
            
            // Show tournament info based on count
            //
            // "total decklists" war zu viel versprochen. Limitless
            // veroeffentlicht Decklisten erst ab Tag 2, und die Kartendateien
            // enthalten deshalb ausschliesslich Tag-2-Listen: 1.058 Listen im
            // Chunk TEF-CRI gegen 5.775 gemeldete Spieler an Tag 1 — 18,3 %.
            // Der Abgleich stimmt nicht nur global, sondern je Turnier und
            // Archetyp (Dragapult 0069: 270 Spieler, 83 Tag 2, 83 Listen).
            // Jeder Inklusionsanteil dieses Reiters beschreibt also den Top
            // Cut, nicht das Feld. Das gehoert an die Zahl geschrieben.
            const deckKachel = document.getElementById('pastMetaStatTournament');
            const dePM = (typeof getLang === 'function' && getLang() === 'de');
            const listenWort = dePM ? 'Tag-2-Decklisten' : 'day-2 decklists';
            deckKachel.textContent = uniqueTournamentCount === 1
                ? `${tournamentNames[0]} (${totalDecklists} ${listenWort})`
                : `${uniqueTournamentCount} Tournaments (${totalDecklists} ${listenWort})`;
            deckKachel.title = dePM
                ? 'Limitless veroeffentlicht Decklisten erst ab Tag 2. Alle Kartenzahlen dieses '
                  + 'Reiters stammen aus dem Top Cut, nicht aus dem ganzen Meta — Anteile sind '
                  + 'dadurch nach oben verzerrt.'
                : 'Limitless publishes decklists from day 2 onward. Every card figure on this tab '
                  + 'comes from the top cut, not the whole field — inclusion rates are biased upward.';
            
            document.getElementById('pastMetaStatFormat').textContent = pastMetaCurrentDeck.format;

            // Save to window for deck builder
            window.pastMetaCurrentArchetype = selectedArchetype;

            // Apply filters and render
            filterPastMetaCards();

            // Tournament-performance drill-down (cumulative WR + matchup
            // matrix). Fire-and-forget — first paint shows a loading state,
            // the labs CSV resolves async and re-renders. No-op when the
            // format filter is "all" (per-meta labs CSV is one-format-only).
            renderPastMetaPerformance(selectedArchetype, formatFilter, tournamentFilter);

            // Most Successful List (Feature A) — surface the single best-
            // placed decklist for the archetype within the active filter.
            // Reads from the per-decklist CSV the MostConsistencyBuilder
            // already loaded, so this is fast after the first archetype
            // pick of the session. Filter handling matches the user's
            // chosen format/tournament dropdowns.
            renderPastMetaMostSuccessfulList(selectedArchetype, formatFilter, tournamentFilter);

            devLog(`Selected archetype: ${selectedArchetype} (${aggregatedCards.length} unique cards across ${uniqueTournamentCount} tournaments, ${totalDecklists} total decklists)`);
          } catch (err) {
            console.error('[Past Meta] Error loading deck cards:', err);
            showToast(t('toast.deckLoadError') + (err.message || err), 'error');
          }
        }
        
        function filterPastMetaCards() {
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                pastMetaFilteredCards = [];
                renderPastMetaCards();
                return;
            }
            
            const filterValue = document.getElementById('pastMetaFilterSelect').value;

            // Apply share-threshold where share data exists, and include top Ace Specs by filter level.
            pastMetaFilteredCards = applyShareFilterWithAceSpecBoost(pastMetaCurrentCards, filterValue);
            
            renderPastMetaCards();
        }
        
        function renderPastMetaCards() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                document.getElementById('pastMetaDeckTableView').classList.add('d-none');
                document.getElementById('pastMetaDeckVisual').classList.add('d-none');
                resetDeckOverviewCounts('pastMetaCardCount', 'pastMetaCardCountSummary', '0 ' + t('cl.cards'), '/ 0 ' + t('cl.total'));
                const gridContainer = document.getElementById('pastMetaDeckGrid');
                if (gridContainer) {
                    const selectedArchetype = String(document.getElementById('pastMetaDeckSelect')?.value || '').trim();
                    if (!selectedArchetype) {
                        renderNoDeckSelectedState('pastMetaDeckGrid', 'Bitte wähle ein Deck aus dem Dropdown, um die Karten zu laden');
                    } else {
                        gridContainer.innerHTML = getEmptyStateBoxHtml({ title: 'No cards found', description: 'No cards match the current filters.', icon: 'cards' });
                    }
                }
                return;
            }
            
            const searchTerm = document.getElementById('pastMetaOverviewSearch').value.toLowerCase();
            
            // Apply search filter
            let cardsToShow = pastMetaFilteredCards.filter(card => {
                if (!searchTerm) return true;
                const cardName = (card.full_card_name || card.card_name || '').toLowerCase();
                return cardName.includes(searchTerm);
            });
            
            // Sort cards (Pokemon, Trainer, Energy)
            const sortedCards = sortCardsByType(cardsToShow);
            
            // Update counts
            const totalCards = getPastMetaSummaryTotalCount(sortedCards);
            // Befund J (30.08.2026): "Cards" und "Total" standen fest auf
            // Englisch, waehrend die City-League-Ansicht an derselben
            // Stelle bereits "33 Karten / 60 Gesamt" schreibt.
            document.getElementById('pastMetaCardCount').textContent = `${sortedCards.length} ${t('cl.cards')}`;
            /* Der Trenner bekommt links Luft. Zusammengesetzt las sich das
            // als "42 Karten/ 60 Gesamt" — der Schraegstrich klebte am
            // Wort davor, weil die beiden Spans direkt aneinanderstiessen. */
            document.getElementById('pastMetaCardCountSummary').textContent = `/ ${Math.round(totalCards)} ${t('cl.total')}`;
            
            // Render based on view mode
            if (pastMetaShowGridView) {
                renderPastMetaGridView(sortedCards);
            } else {
                renderPastMetaTableView(sortedCards);
            }
        }
        
        function renderPastMetaTableView(cards) {
            document.getElementById('pastMetaDeckTableView').classList.remove('d-none');
            document.getElementById('pastMetaDeckVisual').classList.add('d-none');
            
            const tableContainer = document.getElementById('pastMetaDeckTable');
            
            if (cards.length === 0) {
                tableContainer.innerHTML = getEmptyStateBoxHtml({ title: typeof t === 'function' ? t('currentMeta.noCards') : 'No cards found', description: typeof t === 'function' ? t('currentMeta.selectDeckHint') : 'Select a deck to see its card breakdown.', icon: 'cards' });
                return;
            }
            
            let html = '<thead><tr>';
            html += '<th style="width: 60px;">Count</th>';
            html += '<th>Card Name</th>';
            html += '<th style="width: 100px;">ACE SPEC</th>';
            html += '<th style="width: 120px;">Action</th>';
            html += '</tr></thead><tbody>';
            
            cards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = getPastMetaDisplayCount(card);
                const isAceSpecCard = isAceSpec(cardName);
                const proxySetCode = card.set_code || card.set || '';
                const proxySetNumber = card.set_number || card.number || '';
                
                html += '<tr>';
                html += `<td style="text-align: center; font-weight: bold; color: #2c3e50;">${count}</td>`;
                html += `<td>${cardName}</td>`;
                html += `<td style="text-align: center;">${isAceSpecCard ? '<span style="color: var(--tint-bad-ink); font-weight: bold;">★</span>' : '-'}</td>`;
                html += `<td style="text-align: center; display:flex; gap:6px; justify-content:center;"><button class="btn btn-primary" onclick='addCardToDeck("pastMeta", "${escapeJsStr(cardName)}");' style="padding: 6px 12px; font-size: 0.85em;">+ Add</button><button class="btn" style="padding: 6px 10px; font-size: 0.8em; background:var(--solid-bad); color:white;" onclick='addCardToProxy("${escapeJsStr(cardName)}", "${proxySetCode}", "${proxySetNumber}", 1)'>Proxy</button></td>`;
                html += '</tr>';
            });
            
            html += '</tbody>';
            tableContainer.innerHTML = `<div class="past-meta-table-scroll"><table class="past-meta-table-zebra">${html}</table></div>`;
        }
        
        function renderPastMetaGridView(cards) {
            devLog(`[Past Meta] renderPastMetaGridView called with ${cards.length} cards, rarity mode: ${pastMetaRarityMode}`);
            document.getElementById('pastMetaDeckTableView').classList.add('d-none');
            document.getElementById('pastMetaDeckVisual').classList.remove('d-none');
            
            const gridContainer = document.getElementById('pastMetaDeckGrid');
            
            if (cards.length === 0) {
                // Befund C (30.08.2026): festes 'No cards found'.
                gridContainer.innerHTML = '<p style="text-align: center; color: #444; padding: 20px; font-weight: 500;">'
                    + escapeHtml(t('cl.noCardsFound')) + '</p>';
                return;
            }
            
            // Sort cards by type for better organization
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.pastMetaDeck || {};
            
            const cardHtmls = [];
            
            sortedCards.forEach(card => {
                const cardFullName = fixMojibake(card.full_card_name || card.card_name || 'Unknown Card');
                const cardNameEscaped = escapeJsStr(cardFullName);
                const avgCount = parseLocaleNumber(card.card_count || card.average_count_overall || 0, 0); // Average count across all decklists (e.g., 0.98)
                const maxCount = getPastMetaDisplayCount(card);
                const decklistCount = parseLocaleNumber(card.decklist_count || card.total_decks_in_archetype || 0, 0); // Total decklists in archetype
                const deckCountByStats = parseLocaleNumber(card.deck_count || card.deck_inclusion_count || 0, 0); // Number of decks containing this card
                
                // Prefer explicit CSV fields first; only parse from full_card_name as fallback.
                let cardName = cardFullName;
                let setCodeFromName = String(card.set_code || card.set || '').trim().toUpperCase();
                let setNumberFromName = String(card.set_number || card.number || '').trim();

                if ((!setCodeFromName || !setNumberFromName) && card.card_identifier) {
                    const identifierMatch = String(card.card_identifier).trim().match(/^([A-Z0-9]{2,6})\s+([A-Z0-9-]+)$/i);
                    if (identifierMatch) {
                        if (!setCodeFromName) setCodeFromName = identifierMatch[1].toUpperCase();
                        if (!setNumberFromName) setNumberFromName = identifierMatch[2];
                    }
                }
                
                // Match pattern: "Card Name SET NUMBER" (e.g., "Abra MEG 54", "Dragapult ex TWM 130")
                if (!setCodeFromName || !setNumberFromName) {
                    const cardMatch = cardFullName.match(/^(.+?)\s+([A-Z0-9]{2,4})\s+([A-Z0-9]+)$/);
                    if (cardMatch) {
                        cardName = cardMatch[1].trim();
                        setCodeFromName = cardMatch[2];
                        setNumberFromName = cardMatch[3];
                        devLog(`[Past Meta] Parsed card: "${cardFullName}" -> name: "${cardName}", set: "${setCodeFromName}", number: "${setNumberFromName}"`);
                    }
                }
                const rawCardName = cardName;
                cardName = getDisplayCardName(cardName, setCodeFromName, setNumberFromName);
                
                // Calculate statistics
                const rawPercentage = parseLocaleNumber(card.percentage_in_archetype || card.share_percent || '', 0);
                const avgInUsingDecksRaw = parseLocaleNumber(card.average_count || card.avg_count || '', 0);

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (decklistCount > 0 ? ((deckCountByStats / decklistCount) * 100) : 0);
                const avgInUsingDecksValue = Number.isFinite(avgInUsingDecksRaw) && avgInUsingDecksRaw > 0
                    ? avgInUsingDecksRaw
                    : (deckCountByStats > 0 ? (avgCount * decklistCount / deckCountByStats) : 0);

                const percentage = Math.max(0, resolvedPercentage).toFixed(1).replace('.', ',');
                const avgInUsingDecks = Math.max(0, avgInUsingDecksValue).toFixed(2).replace('.', ',');
                const avgCountOverallDisplay = Math.max(0, avgCount).toFixed(2).replace('.', ',');
                const deckCountByStatsDisplay = Math.round(Math.max(0, deckCountByStats));
                const decklistCountDisplay = Math.round(Math.max(0, decklistCount));
                
                // O(1) lookup: canonical set+number first, then robust name index
                const cardInDb = (() => {
                    if (setCodeFromName && setNumberFromName) {
                        const bySetNumber = getCanonicalCardRecord(setCodeFromName, setNumberFromName);
                        if (bySetNumber) return bySetNumber;
                    }
                    return getCardByNameFromIndex(cardName);
                })();
                
                if (cardInDb) {
                    devLog(`[Past Meta] ? Found in DB: ${cardName} -> ${cardInDb.set} ${cardInDb.number}, image: ${cardInDb.image_url ? 'YES' : 'NO'}`);
                } else {
                    devLog(`[Past Meta] ? NOT found in DB: ${cardName} (searched: set="${setCodeFromName}", number="${setNumberFromName}")`);
                }
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                devLog(`[Past Meta] Applying rarity mode "${pastMetaRarityMode}" for card: ${cardName}`);
                
                if (pastMetaRarityMode === 'all' && cardInDb) {
                    // Show ALL international prints
                    let allVersions = getInternationalPrintsForCard(cardInDb.set, cardInDb.number);
                    devLog(`[Past Meta] ALL mode: found ${allVersions ? allVersions.length : 0} versions`);
                    
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        // No versions found, use original
                        versionsToRender = [{ ...card, set_code: cardInDb?.set || '', set_number: cardInDb?.number || '', image_url: cardInDb?.image_url || '' }];
                    }
                } else if (cardInDb) {
                    // 'min' or 'max' mode: Get preferred version
                    // CRITICAL FIX: Set global rarity preference to match Past Meta mode
                    const previousGlobalPref = globalRarityPreference;
                    globalRarityPreference = pastMetaRarityMode; // Temporarily set global to match Past Meta
                    
                    const preferredVersion = getPreferredVersionForCard(cardName, cardInDb.set, cardInDb.number);
                    devLog(`[Past Meta] MIN/MAX mode: preferred version:`, preferredVersion);
                    
                    globalRarityPreference = previousGlobalPref; // Restore global preference
                    
                    if (preferredVersion) {
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version, use original
                        versionsToRender = [{ ...card, set_code: cardInDb.set, set_number: cardInDb.number, image_url: cardInDb.image_url }];
                    }
                } else {
                    // Card not found in database, use placeholder
                    devLog(`[Past Meta] Card not in DB - using placeholder`);
                    versionsToRender = [{ ...card, set_code: '', set_number: '', image_url: '' }];
                }
                
                // Render each version
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const cardNameWarning = getNameWarningHtml(rawCardName, cardName, setCode, setNumber);
                    let germanCardName = (displayCard.name_de || (cardInDb && cardInDb.name_de) || card.card_name_de || '').toLowerCase();
                    
                    const imageUrl = getBestCardImage({
                        ...displayCard,
                        set_code: setCode,
                        set_number: setNumber,
                        card_name: cardName
                    }) || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect width=%22200%22 height=%22280%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2218%22%3ENo Image%3C/text%3E%3C/svg%3E';
                    
                    // Check if card is in deck builder
                    let deckCount = 0;
                    if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                        // Match by set code + set number
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match) {
                                const deckSetCode = match[1];
                                const deckSetNumber = match[2];
                                
                                if (deckSetCode === setCode && deckSetNumber === setNumber) {
                                    deckCount = currentDeck[deckKey] || 0;
                                    break;
                                }
                            }
                        }
                    } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                        // Fallback: exact card name match
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    // Get price and Cardmarket URL
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    if (setCode && setNumber) {
                        let priceCard = (cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
                        if (!priceCard) {
                            const normalizedNumber = setNumber.replace(/^0+/, '') || '0';
                            priceCard = (cardsBySetNumberMap || {})[`${setCode}-${normalizedNumber}`] || null;
                        }
                        
                        if (priceCard) {
                            eurPrice = priceCard.eur_price || '';
                            cardmarketUrl = priceCard.cardmarket_url || '';
                            if (priceCard.name_de) {
                                germanCardName = String(priceCard.name_de).toLowerCase();
                            }
                        }
                    }
                    const priceDisplay = eurPrice || '0,00€';
                    const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                    const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                    
                    // Determine card type for filtering with database-based approach
                    const filterCategory = getCardType(cardName, setCode, setNumber);
                    const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                    
                    // Collection badge
                    const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber);
                    const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                        ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}" title="Owned other INT prints: ${otherPrintOwnedCount}x">
                            <span class="city-league-other-print-sparkle-icon"></span>
                            <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                        </div>`
                        : '';
                    
                    const isPinned = (typeof isPinnedCard === 'function') && isPinnedCard('pastMeta', cardName);
                    const pinnedClass = isPinned ? ' card-is-pinned' : '';
                    const pinTitle = isPinned
                        ? (t('deck.pinTitleUnpin') || 'Unpin')
                        : (t('deck.pinTitlePin') || 'Pin');
                    const pinIcon = isPinned ? '📌' : '📍';
                    const pinBadgeHtml = isPinned
                        ? `<div class="deck-card-pin-badge" title="${pinTitle}">📌</div>`
                        : '';

                    cardHtmls.push(`
                        <div class="card-item city-league-card-item${pinnedClass}" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                            <div class="card-image-container city-league-card-image-container">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                                <div class="city-league-card-badge city-league-card-badge-max"${
                                    avgCount > 0 && avgCount < 0.5
                                        ? ` title="${(typeof getLang === 'function' && getLang() === 'de')
                                            ? `Ø ${avgCount.toFixed(2)} Kopien je Liste — auf 1 aufgerundet, damit die Karte nicht als 0 dasteht`
                                            : `Avg ${avgCount.toFixed(2)} copies per list — rounded up to 1 so the card isn't shown as 0`}"`
                                        : ''}>${maxCount}</div>
                                ${pinBadgeHtml}
                                ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                                ${deckCount > 0 ? `<div class="city-league-card-badge city-league-card-badge-deck">${deckCount}</div>` : ''}
                                ${otherPrintSparkleHtml}
                                <div class="card-info-bottom city-league-card-info-bottom">
                                    <div class="card-info-text city-league-card-info-text">
                                        <div class="city-league-card-title-mobile">${cardName}${cardNameWarning}</div>
                                        <div class="city-league-card-set-stats-row"><div class="city-league-card-set-mobile">${setCode} ${setNumber}</div><div class="city-league-card-stats-mobile">${percentage}%</div></div>
                                        <div class="city-league-card-avg-mobile">Ø ${avgInUsingDecks}x (${avgCountOverallDisplay}x)</div>
                                        <div class="city-league-card-deck-stats-mobile">${deckCountByStatsDisplay} / ${decklistCountDisplay} Decks</div>
                                    </div>
                                    <div class="card-action-buttons city-league-card-action-buttons">
                                        <div class="city-league-card-action-row">
                                            <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('pastMeta', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                            <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                            <button class="city-league-card-action-btn city-league-card-pin-btn${isPinned ? ' is-active' : ''}" onclick="event.stopPropagation(); togglePinCard('pastMeta', '${cardNameEscaped}')" title="${pinTitle}">${pinIcon}</button>
                                            <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('pastMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
                                        </div>
                                        <div class="city-league-card-action-row">
                                            ${setCode && setNumber ? `<button class="city-league-card-action-btn city-league-card-limitless-btn" onclick="event.stopPropagation(); openLimitlessCard('${setCode}', '${setNumber}')" title="${t('cl.openLimitless')}">L</button>` : '<span></span>'}
                                            <button class="city-league-card-action-btn city-league-card-proxy-btn" onclick="event.stopPropagation(); addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" title="${t('cl.proxyTooltip')}">P</button>
                                            <button class="city-league-card-action-btn city-league-card-market-btn" onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" data-market-bg="${priceBackground}" data-market-cursor="${eurPrice ? 'pointer' : 'not-allowed'}" title="${eurPrice ? t('cl.buyCardmarket') + ' ' + eurPrice : t('cl.priceNA')}">${priceDisplay}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                `);
                }); // End of versionsToRender.forEach
            }); // End of cards.forEach
            
            // Progressive batch rendering: show first cards instantly, load rest in background
            // Increment generation counter to cancel any in-flight batch from a previous render call
            const renderGen = ++_pastMetaRenderGen;
            const BATCH_SIZE = 12;
            gridContainer.innerHTML = cardHtmls.slice(0, BATCH_SIZE).join('');
            if (cardHtmls.length > BATCH_SIZE) {
                let offset = BATCH_SIZE;
                (function renderNextBatch() {
                    if (renderGen !== _pastMetaRenderGen) return; // stale render — abort
                    if (offset >= cardHtmls.length) return;
                    const batch = cardHtmls.slice(offset, offset + BATCH_SIZE);
                    gridContainer.insertAdjacentHTML('beforeend', batch.join(''));
                    offset += BATCH_SIZE;
                    requestAnimationFrame(renderNextBatch);
                })();
            }
        }
        
        function filterPastMetaOverviewCards() {
            const searchInput = document.getElementById('pastMetaOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('pastMetaDeckGrid');
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.card-item');
            let visibleCount = 0;
            
            cards.forEach(card => {
                const cardName = card.getAttribute('data-card-name') || '';
                const cardNameDe = card.getAttribute('data-card-name-de') || '';
                const cardType = card.getAttribute('data-card-type') || '';
                const cardSet = card.getAttribute('data-card-set') || '';
                const cardNumber = card.getAttribute('data-card-number') || '';

                // Check search term filter (name, set+number, Pokedex)
                const setNumSpace = `${cardSet} ${cardNumber}`;
                const setNumCombined = `${cardSet}${cardNumber}`;
                // Befund N (30.08.2026): hier fehlte der Pokedex-Zweig ganz,
                // waehrend das Suchfeld daneben Pokedex verspricht. Die
                // Kachel kennt nur ihren Namen, also faellt der Helfer auf
                // window.pokedexNumbers zurueck.
                const dexNum = (typeof window.cardPokedexSearchValue === 'function')
                    ? window.cardPokedexSearchValue({ name: cardName })
                    : '';
                const matchesSearch = searchTerm === '' ||
                    cardName.includes(searchTerm) ||
                    cardNameDe.includes(searchTerm) ||
                    setNumSpace.includes(searchTerm) ||
                    setNumCombined.includes(searchTerm) ||
                    (dexNum !== '' && dexNum === searchTerm) ||
                    (searchTerm.length >= 3 && dexNum !== '' && dexNum.includes(searchTerm));

                const matchesType = pastMetaOverviewCardTypeFilter === 'all' || cardType === pastMetaOverviewCardTypeFilter
                    || (pastMetaOverviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.classList.remove('d-none');
                    visibleCount++;
                } else {
                    card.classList.add('d-none');
                }
            });
            
            // Update card count
            const countElement = document.getElementById('pastMetaCardCount');
            if (countElement) {
                // Befund J (30.08.2026): "Cards" fest verdrahtet.
                countElement.textContent = `${visibleCount} ${t('cl.cards')}`;
            }

            // Befund E (30.08.2026): die Abschnittskoepfe zeigten weiter
            // die ungefilterten Zahlen und blieben bei 0 Treffern stehen;
            // gemeldet wurde die leere Suche nirgends. Melden, nicht
            // verschweigen.
            if (typeof window.uebersichtSuchergebnisMelden === 'function') {
                window.uebersichtSuchergebnisMelden(gridContainer, visibleCount);
            }
        }
        
        function setPastMetaRarityMode(mode) {
            devLog(`[Past Meta] Rarity mode changed to: ${mode}`);
            pastMetaRarityMode = mode;
            
            // Sync global rarity preference so getPreferredVersionForCard() uses the correct mode
            globalRarityPreference = (mode === 'all') ? null : mode;
            
            // Update button styles
            const minBtn = document.getElementById('pastMetaRarityMin');
            const maxBtn = document.getElementById('pastMetaRarityMax');
            const allBtn = document.getElementById('pastMetaRarityAll');
            
            if (minBtn) {
                minBtn.classList.remove('btn-active', 'btn-inactive');
                minBtn.classList.add(mode === 'min' ? 'btn-active' : 'btn-inactive');
            }
            if (maxBtn) {
                maxBtn.classList.remove('btn-active', 'btn-inactive');
                maxBtn.classList.add(mode === 'max' ? 'btn-active' : 'btn-inactive');
            }
            if (allBtn) {
                allBtn.classList.remove('btn-active', 'btn-inactive');
                allBtn.classList.add(mode === 'all' ? 'btn-active' : 'btn-inactive');
            }
            
            // Re-render
            renderPastMetaCards();
        }
        
        function togglePastMetaDeckGridView() {
            const gridViewContainer = document.getElementById('pastMetaDeckVisual');
            const tableViewContainer = document.getElementById('pastMetaDeckTableView');
            const gridButtons = document.querySelectorAll('button[onclick*="togglePastMetaDeckGridView"]');
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('[WARN] Grid or table container not found');
                return;
            }
            
            if (!pastMetaCurrentCards || pastMetaCurrentCards.length === 0) {
                showToast(typeof t === 'function' ? t('currentMeta.selectDeckFirst') : 'Please select a deck first!', 'warning');
                return;
            }
            
            // Toggle between views
            pastMetaShowGridView = !pastMetaShowGridView;
            
            // Befund J (30.08.2026): der Umschalter beschriftete sich in
            // beiden Sprachen englisch. Befund B (30.08.2026): der Zustand
            // wird am Knopf vermerkt, damit ein spaeterer Sprachwechsel
            // die Beschriftung nicht auf den statischen data-i18n-Wert
            // zurueckwirft.
            gridButtons.forEach(b => window.ansichtsUmschalterBeschriften(
                b, pastMetaShowGridView ? 'grid' : 'list'));
            
            // Re-render with new view
            renderPastMetaCards();
            
            // Re-apply search filter
            filterPastMetaOverviewCards();
        }
        
        function copyPastMetaDeckOverview() {
            if (!pastMetaFilteredCards || pastMetaFilteredCards.length === 0) {
                showToast(t('toast.nothingToCopy'), 'warning');
                return;
            }
            
            let deckText = '';
            pastMetaFilteredCards.forEach(card => {
                const cardName = card.full_card_name || card.card_name || 'Unknown Card';
                const count = Math.round(parseFloat(card.card_count) || 0);
                deckText += `${count} ${cardName}\n`;
            });
            
            navigator.clipboard.writeText(deckText).then(() => {
                showToast(t('toast.deckListCopied'), 'success');
            }).catch(err => {
                console.error('Failed to copy:', err);
                showToast(t('toast.copyFailedShort'), 'error');
            });
        }
        
        // (removed duplicate togglePastMetaDeckGridView — full version above)

        // ── Tournament Performance drill-down ─────────────────────
        // Renders the cumulative WR + matchup matrix block under the
        // standard "Cards in Deck / Tournament / Format" stats whenever
        // the user picks an archetype on the Past Meta tab AND a single
        // format is active. Sources:
        //   - data/labs_tournament_decks_<META>.csv  → per-tournament
        //     win/loss/tie + day1/day2; aggregated across the meta for
        //     the cumulative-WR stat cards.
        //   - data/labs_tournament_matchups_<META>.csv → per-meta
        //     aggregated matchup pairs (my_deck × opponent); rendered as
        //     a sortable table. The CSV is produced by labs_tournament_
        //     scraper.py when run with --matchups; if it doesn't exist
        //     yet for this meta, we render a friendly empty state instead
        //     of failing so the panel still surfaces the cumulative WR.
        //
        // Format = "all" is intentionally skipped — the per-meta labs
        // CSVs are one-format-only and aggregating across all closed
        // metas would mix incompatible card pools. Tournament filter is
        // applied if a single tournament is selected (otherwise aggregate
        // over every tournament in the format chunk).
        const _pastMetaLabsDecksCache = new Map(); // metaKey -> parsed rows | null
        const _pastMetaLabsMatchupsCache = new Map(); // metaKey -> parsed rows | null

        function _pmParseCSVQuoted(text, sep) {
            const splitLine = (line) => {
                const out = [];
                let cur = '';
                let inQ = false;
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (c === '"') {
                        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
                        else inQ = !inQ;
                    } else if (c === sep && !inQ) {
                        out.push(cur); cur = '';
                    } else { cur += c; }
                }
                out.push(cur);
                return out;
            };
            const lines = text.replace(/\r/g, '').split('\n');
            if (lines.length < 2) return [];
            const headers = splitLine(lines[0]).map(h => h.trim().replace(/^﻿/, ''));
            return lines.slice(1).filter(l => l.trim()).map(l => {
                const vals = splitLine(l);
                const obj = {};
                headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
                return obj;
            });
        }

        async function _pmLoadLabsCsv(filename, cache) {
            const key = filename;
            if (cache.has(key)) return cache.get(key);
            try {
                const resp = await fetch(`data/${filename}?t=` + Date.now());
                if (!resp.ok) { cache.set(key, null); return null; }
                const text = await resp.text();
                if (!text) { cache.set(key, null); return null; }
                const rows = _pmParseCSVQuoted(text, ',');
                cache.set(key, rows.length > 0 ? rows : null);
                return cache.get(key);
            } catch (_e) {
                cache.set(key, null);
                return null;
            }
        }

        /**
         * Drei Kennungen fuer dasselbe Turnier.
         *
         * Das Auswahlmenue traegt die Limitless-ID aus
         * tournament_cards_data_overview.csv (391…552). Die Labs-Dateien
         * fuehren ihre eigene, vierstellige Kennung (0001…0070), und
         * labs_tournament_matchups_*.csv schreibt dieselbe Zahl noch einmal
         * ohne fuehrende Nullen in tournaments_used ('69,70').
         *
         * Verglichen wurde bis zum 20.08.2026 die Limitless-ID gegen die
         * Labs-ID. Die Schnittmenge beider Mengen ist LEER — bei jeder
         * Einzelturnier-Auswahl blieben Leistungskacheln und
         * Matchup-Tabelle leer, obwohl die Daten im Repo liegen (Spezial
         * Turin, Labs 0069: 383 Listen; NAIC, Labs 0070: 675 Listen).
         *
         * Die Uebersetzungsspalte stand die ganze Zeit in derselben Datei,
         * aus der das Menue gebaut wird: labs_tournament_id. Sie wurde im
         * Frontend nie gelesen.
         */
        function pastMetaLabsTid(limitlessTid) {
            const gesucht = String(limitlessTid == null ? '' : limitlessTid).trim();
            if (!gesucht) return null;
            const eintrag = (pastMetaTournaments || []).find(
                t => String(t.tournament_id || '').trim() === gesucht);
            const labs = eintrag ? String(eintrag.labs_tournament_id || '').trim() : '';
            if (!labs) return null;
            const roh = String(Number(labs));
            return { gepolstert: labs, roh: isNaN(Number(labs)) ? labs : roh };
        }

        /** Trifft eine Kennung aus einer Labs-Datei die gewaehlte Auswahl? */
        function pastMetaTidPasst(kandidat, tids) {
            if (!tids) return true;
            const k = String(kandidat == null ? '' : kandidat).trim();
            if (!k) return false;
            if (k === tids.gepolstert || k === tids.roh) return true;
            const n = Number(k);
            return !isNaN(n) && String(n) === tids.roh;
        }

        async function renderPastMetaPerformance(archetype, formatKey, tournamentFilter) {
            const section = document.getElementById('pastMetaPerformanceSection');
            const cards   = document.getElementById('pastMetaPerformanceCards');
            const matchup = document.getElementById('pastMetaMatchupBlock');
            if (!section || !cards || !matchup) return;

            // Multi-format aggregate isn't supported — labs CSVs are
            // per-meta and combining different rotations would mix decks
            // that wouldn't even share a card pool. Surface the section
            // anyway so the user understands why it's blank instead of
            // silently hiding the entire panel.
            if (!archetype || formatKey === 'all' || !formatKey) {
                section.classList.remove('d-none');
                cards.innerHTML = '';
                matchup.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.performanceFormatAllHint') : 'Pick a specific format to see this archetype\'s cumulative tournament performance.')}</p>`;
                return;
            }

            section.classList.remove('d-none');
            cards.innerHTML = `<div class="past-meta-loading-state">${(typeof t === 'function' ? t('pm.performanceLoading') : 'Loading tournament data…')}</div>`;
            matchup.innerHTML = '';

            const decksRows = await _pmLoadLabsCsv(`labs_tournament_decks_${formatKey}.csv`, _pastMetaLabsDecksCache);
            if (!decksRows || decksRows.length === 0) {
                cards.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.performanceNoData') : 'No labs data available for this format.')}</p>`;
                return;
            }

            // Filter to the selected archetype. Match by exact deck_name
            // (the labs CSV uses the same canonical archetype label as
            // tournament_cards_data_cards_<META>.csv, sanitized of price
            // tags). When a single tournament is selected, narrow further.
            const gewaehlt = tournamentFilter && tournamentFilter !== 'all' ? String(tournamentFilter) : null;
            const wantedTid = gewaehlt ? pastMetaLabsTid(gewaehlt) : null;
            // Ein Turnier ohne Labs-Kennung kann hier nichts liefern. Das
            // sagen, statt eine leere Ansicht als "keine Zeilen" auszugeben.
            if (gewaehlt && !wantedTid) {
                cards.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${
                    (typeof getLang === 'function' && getLang() === 'de')
                        ? 'Für dieses Turnier gibt es keine Turnierauswertung — es fehlt die Zuordnung zu den Labs-Daten.'
                        : 'No tournament breakdown for this event — it has no link to the labs data.'}</p>`;
                matchup.innerHTML = '';
                return;
            }
            const deckRows = decksRows.filter(r => {
                if ((r.deck_name || '').trim() !== archetype) return false;
                if (!pastMetaTidPasst(r.tournament_id, wantedTid)) return false;
                return true;
            });

            if (deckRows.length === 0) {
                cards.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.performanceNoArchetype') : 'No labs rows for this archetype in the selected format.')}</p>`;
                return;
            }

            // Aggregate across the matching rows.
            //
            // Hier stand (S + 0,5·U)/Partien, mit der Begruendung, das sei
            // "consistent with the labs win_pct definition used elsewhere in
            // the app". Das war nachweislich falsch: die Quelldatei
            // data/labs_tournament_decks.csv rechnet ihre Spalte win_pct als
            // Matchpunkte (3S+U)/3P. Ueber alle 4.667 Zeilen weicht die
            // Quelle davon maximal 0,005 Punkte ab — von der hier
            // verwendeten Formel dagegen im Median 2,38 und maximal 12,5.
            //
            // Sichtbar wurde das als Widerspruch IM SELBEN PANEL: fuer
            // Dragapult (TEF-CRI) stand hier 56,3 %, waehrend die
            // Matchup-Tabelle direkt darunter aus derselben Datenlage
            // my_deck_overall_win_pct = 53,7 laedt. Zwei Definitionen, eine
            // Ansicht, kein Wort dazu.
            //
            // Jetzt: dieselbe Konvention wie die Quelle, benannt ueber
            // js/win-rate-konvention.js, und die Formel steht an der Kachel.
            let players = 0, wins = 0, losses = 0, ties = 0;
            let day1 = 0, day2 = 0;
            const seenTournaments = new Set();
            for (const r of deckRows) {
                players += parseInt(r.player_count || '0', 10) || 0;
                wins    += parseFloat(r.wins   || '0') || 0;
                losses  += parseFloat(r.losses || '0') || 0;
                ties    += parseFloat(r.ties   || '0') || 0;
                day1    += parseInt(r.day1_players || '0', 10) || 0;
                day2    += parseInt(r.day2_players || '0', 10) || 0;
                const tid = (r.tournament_id || '').trim();
                if (tid) seenTournaments.add(tid);
            }
            const games = wins + losses + ties;
            /* Fuer den Abgleich mit der Matchup-Matrix darunter, die aus
               einer ANDEREN Datei kommt — siehe die Notiz dort. */
            _pmMatchesGesamt = games;
            const WK = window.WinRateKonvention;
            const winPct = WK
                ? WK.KONVENTIONEN.matchpunkte.rechne(wins, losses, ties)
                : (games > 0 ? (3 * wins + ties) / (3 * games) * 100 : 0);
            const day2Conv = day1 > 0 ? (day2 / day1) * 100 : 0;
            // Eine Quote braucht einen Nenner, den man sehen kann (20.08.2026).
            //
            // In labs_tournament_decks.csv tragen 74 von 4.667 Zeilen eine
            // Day-1-zu-Day-2-Konversion von genau 100 %. 65 davon stehen auf
            // EINEM Spieler, acht auf zweien, eine auf vieren. Das ist keine
            // Konversionsrate, das ist "der eine Spieler kam durch".
            //
            // Die Kachel zeigte davon nichts: "100,0 %" in derselben Groesse
            // und Form wie eine Quote aus 600 Spielern. Jetzt steht der
            // Nenner darunter, und unter der Schwelle sagt die Kachel, dass
            // sie keine Quote ist. Der Wert bleibt sichtbar — er ist ja
            // richtig, er ist nur nicht das, wonach er aussieht.
            const DAY2_MIN_SPIELER = 10;
            const day2Duenn = day1 > 0 && day1 < DAY2_MIN_SPIELER;
            const fmtPct = (n) => n.toFixed(1).replace('.', ',') + '%';
            const fmtInt = (n) => zahlLokal(Math.round(n));

            const tournLabel = (typeof t === 'function' ? t('pm.perfStatTournaments') : 'Tournaments');
            const playersLabel = (typeof t === 'function' ? t('pm.perfStatPlayers') : 'Players');
            const recordLabel = (typeof t === 'function' ? t('pm.perfStatRecord') : 'Record (W-L-T)');
            const winPctLabel = (typeof t === 'function' ? t('pm.perfStatWinPct') : 'Cumulative Win %');
            const winPctHinweis = WK ? WK.hinweis('matchpunkte') : '';
            const day2Label = (typeof t === 'function' ? t('pm.perfStatDay2Conv') : 'Day-2 Conversion');

            cards.innerHTML = `
                <div class="past-meta-stat-card">
                    <div class="past-meta-stat-label">${tournLabel}</div>
                    <div class="past-meta-stat-value">${seenTournaments.size}</div>
                </div>
                <div class="past-meta-stat-card">
                    <div class="past-meta-stat-label">${playersLabel}</div>
                    <div class="past-meta-stat-value">${fmtInt(players)}</div>
                </div>
                <div class="past-meta-stat-card">
                    <div class="past-meta-stat-label">${recordLabel}</div>
                    <div class="past-meta-stat-value past-meta-stat-mono">${fmtInt(wins)}-${fmtInt(losses)}-${fmtInt(ties)}</div>
                </div>
                <div class="past-meta-stat-card" title="${(winPctHinweis || '').replace(/"/g, '&quot;')}">
                    <div class="past-meta-stat-label">${winPctLabel}</div>
                    <div class="past-meta-stat-value">${isFinite(winPct) ? fmtPct(winPct) : '–'}</div>
                </div>
                <div class="past-meta-stat-card${day2Duenn ? ' past-meta-stat-duenn' : ''}"${
                    day2Duenn ? ` title="${((typeof t === 'function'
                        ? t('pm.day2ThinTip')
                        : 'Fewer than {n} day-1 players — this is a single result, not a rate.')
                        .replace('{n}', String(DAY2_MIN_SPIELER))).replace(/"/g, '&quot;')}"` : ''}>
                    <div class="past-meta-stat-label">${day2Label}</div>
                    <div class="past-meta-stat-value">${day1 > 0 ? fmtPct(day2Conv) : '–'}</div>
                    <div class="past-meta-stat-nenner">${
                        day1 > 0
                            ? `${fmtInt(day2)} / ${fmtInt(day1)}` + (day2Duenn
                                ? ` · ${(typeof t === 'function' ? t('pm.day2Thin') : 'thin')}` : '')
                            : (typeof t === 'function' ? t('pm.day2NoBasis') : 'no day-1 figures')
                    }</div>
                </div>
            `;

            // Matchup matrix — render asynchronously so the cumulative
            // panel paints first. labs_tournament_matchups_<META>.csv is
            // produced by `labs_tournament_scraper.py --matchups` (slow,
            // 1 HTTP per deck per tournament) so older meta chunks may
            // not have it yet. Empty state explains that explicitly.
            await _renderPastMetaMatchupMatrix(archetype, formatKey, wantedTid, matchup);
        }

        async function _renderPastMetaMatchupMatrix(archetype, formatKey, tournamentFilter, container) {
            const titleLabel = (typeof t === 'function' ? t('pm.matchupMatrixTitle') : 'Matchup Matrix');
            const loadingLabel = (typeof t === 'function' ? t('pm.matchupLoading') : 'Loading matchup data…');
            container.innerHTML = `
                <h3 class="past-meta-matchup-title">${titleLabel}</h3>
                <div class="past-meta-loading-state">${loadingLabel}</div>
            `;

            const rows = await _pmLoadLabsCsv(`labs_tournament_matchups_${formatKey}.csv`, _pastMetaLabsMatchupsCache);
            if (!rows || rows.length === 0) {
                const emptyLabel = (typeof t === 'function' ? t('pm.matchupEmpty') : 'Labs matchup data hasn\'t been scraped for this format yet. Cumulative results above are still complete.');
                container.innerHTML = `
                    <h3 class="past-meta-matchup-title">${titleLabel}</h3>
                    <p class="past-meta-section-hint past-meta-empty-state">${emptyLabel}</p>
                `;
                return;
            }

            // Filter to "my deck = archetype" + optional tournament filter.
            // The matchup CSV's day_filter column distinguishes overall /
            // day1 / day2 splits — start with 'overall' to avoid duplicate
            // rows in the matrix. (Day-1/Day-2 split could be a future
            // toggle.)
            const myRows = rows.filter(r => {
                if ((r.my_deck_name || '').trim() !== archetype) return false;
                if ((r.day_filter || '').trim() !== 'overall') return false;
                if (tournamentFilter) {
                    // tournaments_used ist kommagetrennt und schreibt die
                    // Labs-Kennung OHNE fuehrende Nullen ('69,70'). Beide
                    // Schreibweisen zaehlen.
                    const used = (r.tournaments_used || '').split(',');
                    if (!used.some(x => pastMetaTidPasst(x, tournamentFilter))) return false;
                }
                return true;
            });

            // F14 — die Matrix bleibt formatweit, auch wenn ein einzelnes
            // Turnier gewaehlt ist.
            //
            // labs_tournament_matchups_<META>.csv fuehrt KEINE Zeile je
            // Turnier. Gemessen am 21.08.2026: alle 5.819 Zeilen des Chunks
            // TEF-CRI tragen tournaments_used='69,70' und tournament_count=2,
            // in TEF-POR sind es sieben Turniere je Zeile. Der Filter oben
            // trifft also, sobald das gewaehlte Turnier in der Liste steht —
            // und zeigt danach den Schnitt ueber ALLE Turniere des Formats.
            //
            // Die Daten je Turnier gibt es nicht; erfinden laesst sich das
            // nicht. Was fehlt, ist der Satz darueber. Ohne ihn liest sich
            // "Spezial Turin, Dragapult vs Gardevoir 54,2 %" als Ergebnis
            // dieses einen Turniers, und das ist es nicht.
            const _muTurniere = new Set();
            myRows.forEach(r => String(r.tournaments_used || '').split(',')
                .forEach(x => { const v = x.trim(); if (v) _muTurniere.add(v); }));
            const _muFormatweit = !!tournamentFilter && _muTurniere.size > 1;

            if (myRows.length === 0) {
                const noPairsLabel = (typeof t === 'function' ? t('pm.matchupNoPairs') : 'No matchup pairs recorded for this archetype.');
                container.innerHTML = `
                    <h3 class="past-meta-matchup-title">${titleLabel}</h3>
                    <p class="past-meta-section-hint past-meta-empty-state">${noPairsLabel}</p>
                `;
                return;
            }

            // Sort by games played desc — most relevant opponents on top.
            // Within tied counts, sort by WR desc so the player sees their
            // best matchups first.
            const opps = myRows.map(r => ({
                name: r.opponent_deck_name || r.opponent_deck_slug || 'Unknown',
                games: parseInt(r.vs_count || '0', 10) || 0,
                winPct: parseLocaleNumber(r.vs_win_pct || '0', 0) || 0,
            })).sort((a, b) => (b.games - a.games) || (b.winPct - a.winPct));

            const headerOpp = (typeof t === 'function' ? t('pm.matchupColOpponent') : 'Opponent');
            const headerGames = (typeof t === 'function' ? t('pm.matchupColGames') : 'Games');
            const headerWr = (typeof t === 'function' ? t('pm.matchupColWinPct') : 'Win %');
            const tournHint = (typeof t === 'function' ? t('pm.matchupTournHint') : 'Aggregated across labs tournaments where this archetype appeared.');

            // Mindeststichprobe. Diese Tabelle hatte als einzige Matchup-Ansicht
            // gar keine: "Mega Camerupt, 1 Game, 100,0 %" stand gleichrangig
            // neben einer Zeile mit 544 Partien. Unter der Schwelle bleibt der
            // Wert sichtbar — er ist ja gemessen — verliert aber die Farbe, die
            // ihn als Signal ausweist, und die Zeile wird ausgegraut.
            const MU_MIN_GAMES = (typeof window.CONV_MIN_N === 'number') ? window.CONV_MIN_N : 20;

            // Die Spalte hiess "Sieg %" und zeigte Matchpunkte.
            //
            // Nachgewiesen an data/labs_tournament_matchups.csv: von 38.259
            // Paaren mit Gegenrichtung summieren sich 16.707 (43,7 %) NICHT
            // auf 100 % — bei einer echten Siegquote muesste das immer
            // aufgehen. Und alle 351 Spiegel-Zeilen liegen unter 50 %
            // (Median 47,57), was fuer eine Siegquote gegen sich selbst
            // unmoeglich ist. Loest man nach den Unentschieden auf, kommen
            // ganze Zahlen heraus: es sind Matchpunkte.
            //
            // Unter dieser Skala ist ein Spiegel-Matchup UNTER 50 % der
            // Normalfall, nicht ein schlechtes Ergebnis — die Unentschieden
            // ziehen beide Seiten herunter. Die Farbschwellen bleiben, wo
            // sie waren; der Kopf sagt jetzt, welche Skala darunter liegt.
            const wkMatch = window.WinRateKonvention;
            const wrTitel = wkMatch ? wkMatch.hinweis('matchpunkte') : '';

            const rowsHtml = opps.map(o => {
                const thin = !(o.games >= MU_MIN_GAMES);
                const wrCls = thin ? 'past-meta-mu-even'
                           : o.winPct >= 55 ? 'past-meta-mu-good'
                           : o.winPct <= 45 ? 'past-meta-mu-bad'
                           : 'past-meta-mu-even';
                return `<tr${thin ? ' class="is-muted"' : ''}>
                    <td>${(typeof window.escapeHtml === 'function' ? window.escapeHtml(o.name) : o.name)}</td>
                    <td class="past-meta-mu-games">${o.games}</td>
                    <td class="past-meta-mu-wr ${wrCls}">${o.winPct.toFixed(1).replace('.', ',')}%</td>
                </tr>`;
            }).join('');

            /* ── Was die Spalte NICHT enthaelt ────────────────────────
             *
             * BEFUND DER ABNAHME (02.09.2026): die Kachel "Record
             * (W-L-T)" sagte 218-159-70, also 447 Matches. Die Spalte
             * "Matches" der Matrix darunter summierte 421. 26 Matches
             * (5,8 %) tauchten in keiner Zeile auf, ohne dass irgendwo
             * stand warum — Gegner, deren Archetyp die Quelle nicht
             * erkannt hat.
             *
             * Gerade weil der Rest nachrechenbar ist (Matchpunkte 54,0 %
             * und Day-2-Conversion 26,4 % gehen beide exakt auf), faellt
             * die eine Luecke auf, sobald jemand die Spalte addiert. Die
             * Zahl selbst ist nicht falsch; sie war nur unerklaert. */
            const _matrixRestZeile = function (zeilen) {
                var summe = (zeilen || []).reduce(function (a, o) { return a + (Number(o.games) || 0); }, 0);
                var rest = Math.round(_pmMatchesGesamt - summe);
                if (!(_pmMatchesGesamt > 0) || rest <= 0) return '';
                var de = (typeof getLang === 'function' ? getLang() : 'de') === 'de';
                return '<p class="past-meta-section-hint">' + (de
                    ? ('Die Spalte summiert ' + Math.round(summe) + ' der ' + Math.round(_pmMatchesGesamt)
                       + ' Matches aus der Bilanz oben. Die übrigen ' + rest
                       + ' liefen gegen Gegner, deren Archetyp die Quelle nicht zugeordnet hat.')
                    : ('The column sums ' + Math.round(summe) + ' of the ' + Math.round(_pmMatchesGesamt)
                       + ' matches in the record above. The remaining ' + rest
                       + ' were against opponents whose archetype the source did not resolve.'))
                    + '</p>';
            };

            const _muVorbehalt = _muFormatweit
                ? `<p class="past-meta-mu-vorbehalt">${
                    (typeof t === 'function' ? t('pm.matchupFormatWide') : '')
                        .replace('{n}', String(_muTurniere.size))}</p>`
                : '';

            container.innerHTML = `
                <h3 class="past-meta-matchup-title">${titleLabel}</h3>
                ${_muVorbehalt}
                <p class="past-meta-section-hint">${tournHint} ${
                    (typeof getLang === 'function' && getLang() === 'de')
                        ? `Unter ${MU_MIN_GAMES} Matches ausgegraut und ohne Farbe.`
                        : `Below ${MU_MIN_GAMES} games: faded and shown without colour.`}</p>
                ${_matrixRestZeile(opps)}
                <div class="past-meta-matchup-table-wrap">
                    <table class="past-meta-matchup-table">
                        <thead><tr>
                            <th>${headerOpp}</th>
                            <th>${headerGames}</th>
                            <th title="${wrTitel.replace(/"/g, '&quot;')}">${headerWr}</th>
                        </tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        // ── Most Successful List (Feature A) ─────────────────────
        //
        // Surfaces the SINGLE best-placed decklist for the selected
        // archetype within the active format/tournament filter, with
        // a one-click "Compare with built deck" action that diffs it
        // against whatever the deck-builder has just generated.
        //
        // Data source: the same per-decklist CSV the
        // MostConsistencyBuilder consumes. Reusing the builder's
        // loader avoids a second network fetch and keeps the per-
        // archetype index hot across the Past Meta + Deck-Builder
        // flows.
        //
        // "Best" = lowest `place` first, then highest weighted win-
        // rate (wins + 0.5·ties) / games as a tiebreak. We deliberately
        // don't blend in tournament size here — the user asked for the
        // "Most Successful List", singular, and a clear absolute
        // placement is what they expect to see (deeper analysis is
        // already in the Performance section above).

        function _pmListWinRate(list) {
            const games = (list.wins || 0) + (list.losses || 0) + (list.ties || 0);
            if (games <= 0) return 0;
            return ((list.wins || 0) + 0.5 * (list.ties || 0)) / games;
        }

        function _pmCleanTournamentName(name) {
            return String(name || '').replace(/\s*[-|•–]\s*Limitless\s*$/i, '');
        }

        // Pre-aggregate cards per list by normalized name so the
        // rendered grid doesn't show the same card twice when the
        // upstream HTML split printings across rows (mirrors the
        // dedup we did in MostConsistencyBuilder's _computeCardScores).
        function _pmConsolidateCards(rawCards) {
            const byName = new Map();
            for (const c of (rawCards || [])) {
                const key = String(c.name || '').trim().toLowerCase();
                if (!key) continue;
                if (!byName.has(key)) {
                    byName.set(key, {
                        name: c.name,
                        set_code: c.set_code || '',
                        set_number: c.set_number || '',
                        count: 0,
                        type: c.type || '',
                        is_ace_spec: !!c.is_ace_spec,
                    });
                }
                const e = byName.get(key);
                e.count += (c.count || 0);
                // Prefer the variant with set info for image rendering.
                if (!e.set_code && c.set_code) {
                    e.set_code = c.set_code;
                    e.set_number = c.set_number;
                }
                if (c.is_ace_spec) e.is_ace_spec = true;
                if (!e.type && c.type) e.type = c.type;
            }
            return Array.from(byName.values());
        }

        async function renderPastMetaMostSuccessfulList(archetype, formatKey, tournamentId) {
            const section = document.getElementById('pastMetaMostSuccessfulSection');
            const body    = document.getElementById('pastMetaMostSuccessfulBody');
            if (!section || !body) return;

            if (!archetype) {
                section.classList.add('d-none');
                window.pastMetaMostSuccessfulList = null;
                return;
            }

            section.classList.remove('d-none');
            body.innerHTML = `<div class="past-meta-loading-state">${(typeof t === 'function' ? t('pm.mostSuccessfulLoading') : 'Loading…')}</div>`;

            const builder = window.MostConsistencyBuilder;
            if (!builder || typeof builder.loadData !== 'function') {
                body.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.mostSuccessfulUnavailable') : 'Per-decklist data not loaded yet.')}</p>`;
                return;
            }
            try {
                await builder.loadData();
            } catch (e) {
                console.warn('[Past Meta · Most Successful] data load failed:', e);
                body.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.mostSuccessfulLoadError') : 'Could not load per-decklist data.')}</p>`;
                return;
            }

            let lists = (builder.listsForArchetype(archetype) || []).slice();
            if (formatKey && formatKey !== 'all') {
                lists = lists.filter(l => (l.meta || '') === formatKey);
            }
            if (tournamentId && tournamentId !== 'all') {
                lists = lists.filter(l => String(l.tournament_id || '') === String(tournamentId));
            }

            if (lists.length === 0) {
                body.innerHTML = `<p class="past-meta-section-hint past-meta-empty-state">${(typeof t === 'function' ? t('pm.mostSuccessfulNoLists') : 'No per-decklist data for this archetype + filter.')}</p>`;
                window.pastMetaMostSuccessfulList = null;
                return;
            }

            // "Most successful" in a moving meta means: best placement
            // at the LATEST relevant tournament — a #1 from the oldest
            // event in the format shouldn't outrank a #2 from the most
            // recent one. So when the user hasn't pinned a specific
            // tournament, we narrow to the most recent date in the
            // filtered set first, then rank by placement within it.
            //
            // Tiebreak: weighted win-rate (wins + 0.5·ties)/games.
            //
            // tournament_date is ISO yyyy-mm-dd in the per-decklist
            // CSV, so a plain string compare gives correct ordering.
            if (!tournamentId || tournamentId === 'all') {
                const latestDate = lists.reduce((acc, l) => {
                    const d = (l.tournament_date || '');
                    return d > acc ? d : acc;
                }, '');
                if (latestDate) {
                    lists = lists.filter(l => (l.tournament_date || '') === latestDate);
                }
            }

            lists.sort((a, b) => {
                const pA = a.place || 99999, pB = b.place || 99999;
                if (pA !== pB) return pA - pB;
                return _pmListWinRate(b) - _pmListWinRate(a);
            });
            const best = lists[0];
            const cards = _pmConsolidateCards(best.cards);

            // Stash for the compare/copy actions below.
            window.pastMetaMostSuccessfulList = { ...best, cards };

            const totalCards = cards.reduce((s, c) => s + (c.count || 0), 0);
            // Die ANGEZEIGTE Quote nennt jetzt ihre Konvention: Matchpunkte,
            // wie die Performance-Sektion oben (Z.1625/1775) und wie die
            // Platzierung tatsächlich entschieden wird. Vorher stand hier die
            // unbenannte, hauseigen als "erfunden" markierte Formel
            // (S+0,5·U)/Partien aus _pmListWinRate — die bleibt nur noch als
            // interner Sortier-Tiebreak oben, nicht als angezeigte Zahl (F24).
            const _WK = window.WinRateKonvention;
            const _wpVal = _WK
                ? _WK.KONVENTIONEN.matchpunkte.rechne(best.wins || 0, best.losses || 0, best.ties || 0)
                : (_pmListWinRate(best) * 100);
            const wpStr = (Number.isFinite(_wpVal) ? _wpVal : 0).toFixed(1).replace('.', ',') + '%';
            const wpHinweis = _WK ? _WK.hinweis('matchpunkte') : '';
            const placeStr = (best.place && best.place < 9999) ? `#${best.place}` : '—';
            const tournName = _pmCleanTournamentName(best.tournament_name);
            const _esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const cardsLbl = (typeof t === 'function' ? t('pm.mostSuccessfulCardsCount') : 'cards');
            const cmpBtnLbl = (typeof t === 'function' ? t('pm.mostSuccessfulCompareBtn') : 'Compare with built deck');
            const copyBtnLbl = (typeof t === 'function' ? t('pm.mostSuccessfulCopyBtn') : 'Copy decklist');

            // Card grid — sort by the same category order the rest of
            // the site uses (sortCardsByType in app-deck-builder.js):
            // Pokemon → Supporter → Item → Tool → Stadium → SpecEnergy
            // → BasicEnergy. The per-decklist CSV ships with `type`
            // empty on ~70 % of rows, so enrich from the global card
            // DB first — without that step the bucket collapses to
            // count-desc only and you get Pokémon mixed in with
            // energies, which is what the user flagged 2026-06-10.
            const _enrichType = (c) => {
                if (c && c.type) return c;
                const set = String(c?.set_code || '').toUpperCase().trim();
                const num = String(c?.set_number || '').trim();
                if (!set || !num) return c;
                const db = window.cardsBySetNumberMap;
                if (!db) return c;
                const numStripped = num.replace(/^0+/, '') || '0';
                const keys = [
                    `${set}-${num}`,
                    `${set}-${numStripped}`,
                    `${set}-${numStripped.padStart(3, '0')}`,
                ];
                for (const k of keys) {
                    const entry = db[k];
                    if (entry && (entry.type || entry.card_type)) {
                        c.type = entry.type || entry.card_type;
                        return c;
                    }
                }
                return c;
            };
            const _TYPE_ORDER = {
                'Pokemon': 1, 'Supporter': 2, 'Item': 3, 'Tool': 4,
                'Stadium': 5, 'Special Energy': 6, 'Basic Energy': 7, 'Energy': 7,
            };
            const _typeRank = (c) => {
                _enrichType(c);
                const ty = String(c.type || '').toLowerCase();
                if (!ty) return 99;  // unknown cards sink to the bottom
                if (typeof window.getCardTypeCategory === 'function') {
                    const cat = window.getCardTypeCategory(c.type || '');
                    return _TYPE_ORDER[cat] || 99;
                }
                if (ty.includes('special') && ty.includes('energy')) return 6;
                if (ty.includes('energy')) return 7;
                if (ty.includes('supp')) return 2;
                if (ty.includes('tool')) return 4;
                if (ty.includes('stadium')) return 5;
                if (ty.includes('item') || ty === 'trainer') return 3;
                if (ty.includes('pok')) return 1;
                return 99;
            };
            cards.sort((a, b) => {
                const tr = _typeRank(a) - _typeRank(b);
                if (tr !== 0) return tr;
                return (b.count || 0) - (a.count || 0);
            });

            const cardHtmls = cards.map(c => {
                const setCode = String(c.set_code || '').trim().toUpperCase();
                const setNum  = String(c.set_number || '').trim();
                // Prefer the unified site image resolver — see same
                // fix in current-meta-quickref.js for the rationale
                // (hardcoded `_R_EN_LG.png` pattern + unpadded number
                // misses ~40 % of cards because the limitless CDN
                // varies rarity letter per print and zero-pads the
                // number for 3-letter EN set codes).
                let imgUrl = '';
                if (setCode && setNum) {
                    if (typeof window.getUnifiedCardImage === 'function') {
                        try { imgUrl = window.getUnifiedCardImage(setCode, setNum) || ''; } catch (_) { imgUrl = ''; }
                    }
                    if (!imgUrl) {
                        const padded = /^\d+$/.test(setNum) ? setNum.padStart(3, '0') : setNum;
                        imgUrl = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${setCode}/${setCode}_${padded}_R_EN_LG.png`;
                    }
                }
                return `
                    <div class="past-meta-best-card" title="${_esc(c.name)} (${c.count}x)">
                        ${imgUrl ? `<img src="${imgUrl}" alt="${_esc(c.name)}" loading="lazy" onerror="this.style.display='none'">` : `<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.7rem;color:var(--ink-3);text-align:center;padding:4px;">${_esc(c.name)}</span>`}
                        <div class="past-meta-best-card-count">${c.count}</div>
                    </div>
                `;
            }).join('');

            // Suppress the record block when wins/losses/ties are all
            // zero. The per-decklist scraper currently can't extract
            // the W-L column for Special-Event standings tables; the
            // CSV-side backfill from player_continuity.csv covers most
            // affected rows but a handful of players don't appear in
            // continuity. Showing "0-0-0 · 0,0%" for those would read
            // as "this player went 0-0-0", which is wrong — better to
            // hide the block than display misleading data.
            const games = (best.wins || 0) + (best.losses || 0) + (best.ties || 0);
            const recordBlock = games > 0
                ? `<span class="past-meta-best-record"${wpHinweis ? ` title="${_esc(wpHinweis)}"` : ''}>${best.wins || 0}-${best.losses || 0}-${best.ties || 0} · ${wpStr}</span>`
                : '';

            body.innerHTML = `
                <div class="past-meta-best-header">
                    <div class="past-meta-best-headline">
                        <span class="past-meta-best-place">${_esc(placeStr)}</span>
                        <span class="past-meta-best-name">${_esc(best.player_name)}</span>
                        ${recordBlock}
                    </div>
                    <div class="past-meta-best-sub">${_esc(tournName)} · ${_esc(best.tournament_date)} · ${totalCards} ${_esc(cardsLbl)}</div>
                    <div class="past-meta-best-actions">
                        <button class="btn-modern primary" onclick="compareMostSuccessfulWithBuilder('pastMeta')">${_esc(cmpBtnLbl)}</button>
                        <button class="btn-modern" onclick="copyMostSuccessfulList()">${_esc(copyBtnLbl)}</button>
                    </div>
                </div>
                <div class="past-meta-best-grid">${cardHtmls}</div>
            `;
        }

        // One-click compare: convert the most-successful list to the
        // oldDeck format performDeckComparison() expects, read the
        // current deck-builder deck as the newDeck, fire the existing
        // comparison modal pre-populated with the result. Reuses the
        // proven diff logic from app-features.js instead of forking it.
        function compareMostSuccessfulWithBuilder(source) {
            const best = window.pastMetaMostSuccessfulList;
            if (!best) {
                if (typeof showToast === 'function') {
                    showToast((typeof t === 'function' ? t('pm.mostSuccessfulNoLists') : 'No list available to compare.'), 'warning');
                }
                return;
            }
            const src = source || 'pastMeta';
            const deckMap = src === 'cityLeague' ? window.cityLeagueDeck :
                            src === 'currentMeta' ? window.currentMetaDeck :
                            window.pastMetaDeck;
            if (!deckMap || Object.keys(deckMap).length === 0) {
                const msg = (typeof t === 'function' ? t('pm.mostSuccessfulNoBuilderDeck') : 'Deck builder is empty — run "Consistency Generate" first.');
                if (typeof showToast === 'function') showToast(msg, 'warning');
                return;
            }

            // Map the best list's cards into the { count, name, set,
            // number, key } shape performDeckComparison() consumes.
            const oldDeck = (best.cards || []).map(c => ({
                count:  c.count || 0,
                name:   c.name,
                set:    c.set_code || null,
                number: c.set_number || null,
                key:    (c.set_code && c.set_number) ? `${c.set_code}-${c.set_number}` : (c.name || ''),
            })).filter(e => e.count > 0);

            // Build the current deck (mirrors compareWithSavedDeck in
            // app-features.js — same key parser).
            const currentDeck = [];
            for (const [key, count] of Object.entries(deckMap)) {
                const m = key.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (m) {
                    currentDeck.push({
                        count, name: m[1], set: m[2], number: m[3],
                        key: `${m[2]}-${m[3]}`,
                    });
                } else {
                    currentDeck.push({ count, name: key, set: null, number: null, key });
                }
            }

            // Open the standard compare modal so the result lands in
            // the slot the user already knows. We don't need to set
            // app-features.js's local `currentDeckSource` — we're
            // calling performDeckComparison() directly with both
            // decks, bypassing the saved-deck dropdown branch.
            const modal = document.getElementById('deckCompareModal');
            if (modal) modal.style.display = 'flex';

            const labelBits = [];
            if (best.player_name) labelBits.push(best.player_name);
            if (best.place && best.place < 9999) labelBits.push(`#${best.place}`);
            const cleanT = _pmCleanTournamentName(best.tournament_name);
            if (cleanT) labelBits.push(cleanT);
            const oldName = labelBits.join(' · ') || 'Most Successful List';

            if (typeof performDeckComparison === 'function') {
                performDeckComparison(oldDeck, currentDeck, oldName);
            } else {
                console.warn('[Most Successful Compare] performDeckComparison() not loaded.');
            }
        }

        function copyMostSuccessfulList() {
            const best = window.pastMetaMostSuccessfulList;
            if (!best || !Array.isArray(best.cards) || best.cards.length === 0) return;
            // PTCGO/PTCG Live export format — same shape every player
            // pastes from Limitless / TCG Showdown, so the user can
            // paste this straight into their client.
            const lines = best.cards
                .filter(c => c.count > 0)
                .sort((a, b) => (b.count || 0) - (a.count || 0))
                .map(c => {
                    const setCode = String(c.set_code || '').trim();
                    const setNum  = String(c.set_number || '').trim();
                    return setCode && setNum
                        ? `${c.count} ${c.name} ${setCode} ${setNum}`
                        : `${c.count} ${c.name}`;
                });
            const total = best.cards.reduce((s, c) => s + (c.count || 0), 0);
            const text = lines.join('\n') + `\n\nTotal: ${total}\n`;
            const done = () => {
                if (typeof showToast === 'function') {
                    showToast((typeof t === 'function' ? t('pm.mostSuccessfulCopied') : 'Decklist copied.'), 'success');
                }
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => done());
            } else {
                done();
            }
        }

        // Expose for inline callers / dev tools (matches the convention
        // used by other Past Meta helpers like filterPastMetaOverviewCards).
        window.renderPastMetaPerformance = renderPastMetaPerformance;
        window.renderPastMetaMostSuccessfulList = renderPastMetaMostSuccessfulList;
        window.compareMostSuccessfulWithBuilder = compareMostSuccessfulWithBuilder;
        window.copyMostSuccessfulList = copyMostSuccessfulList;

        // Generic function to render deck analysis tables


/* ── Die Kartenzaehler beim Sprachwechsel ────────────────────────────
 *
 * BEFUND DER ABNAHME (03.09.2026): der erste Versuch haengte
 * `data-i18n` an die beiden Spans, damit der Platzhalter nicht englisch
 * bleibt. Das war schlimmer als das Problem: updateTranslationsInDOM
 * setzt fuer jedes [data-i18n] ohne Kindelemente el.innerHTML — also
 * wurde die GEZEICHNETE Zahl bei jedem Sprachwechsel auf "0 cards"
 * zurueckgesetzt und blieb es. Gemessen: "33 Karten / 60 Gesamt" wurde
 * nach switchLanguage('en') zu "0 cards / 0 total".
 *
 * Richtig ist, die Zahl zu behalten und nur das Wort zu tauschen. Auf
 * city-league faengt der eigene languageChanged-Neuzeichner das ab,
 * auf past-meta gab es nichts.
 */
document.addEventListener('languageChanged', function () {
    /* Die Preisfelder tragen bewusst KEIN data-i18n: sie werden zur
       Laufzeit mit dem echten Deckpreis beschrieben, und ein
       data-i18n haette ihn beim Sprachwechsel geloescht — genau der
       Fehler, den die Abnahme am 03.09.2026 an den Kartenzaehlern
       gefunden hat. Hier wird nur das Trennzeichen nachgezogen. */
    ['cityLeagueDeckPrice', 'currentMetaDeckPrice', 'pastMetaDeckPrice',
     'profile-collection-value'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var m = String(el.textContent).match(/(-?[\d.,]+)/);
        if (!m) return;
        var zahl = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
        if (!Number.isFinite(zahl)) return;
        var txt = (typeof window.zahlLokal === 'function')
            ? window.zahlLokal(zahl, 2)
            : zahl.toFixed(2);
        el.textContent = txt + ' €';
    });

    var paare = [
        ['pastMetaCardCount', 'cl.cards'],
        ['cityLeagueCardCount', 'cl.cards'],
        ['pastMetaCardCountSummary', 'cl.total'],
        ['cityLeagueCardCountSummary', 'cl.total'],
    ];
    paare.forEach(function (paar) {
        var el = document.getElementById(paar[0]);
        if (!el) return;
        var zahl = (el.textContent.match(/[\d.,]+/) || ['0'])[0];
        var wort = (typeof t === 'function') ? t(paar[1]) : '';
        var schraeg = /Summary$/.test(paar[0]) ? '/ ' : '';
        el.textContent = schraeg + zahl + ' ' + wort;
    });
});
