// app-current-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // Debounce timer for heatmap search inputs
        let _heatmapDebounceTimer = null;
        function debouncedRenderHeatmap() {
            clearTimeout(_heatmapDebounceTimer);
            _heatmapDebounceTimer = setTimeout(() => {
                if (typeof renderMatchupHeatmap === 'function') renderMatchupHeatmap();
            }, 200);
        }

        // Matchup data registry (avoids Object.keys(window) scan)
        window._matchupRegistry = window._matchupRegistry || {};

        /* DIE PRAESENZSEITE DER HEATMAP.
         *
         * Auftrag des Betreibers (02.09.2026): "vll sollten wir auch in der
         * Heatmap in jedem Feld online Win Rate / Major Win Rate zeigen so
         * hat man immer und ueberall den Vergleich".
         *
         * Abdeckung nachgemessen am Top-10-Gitter (TEF-PBL, Worlds San
         * Francisco): 90 von 90 Zellen haben einen Major-Wert, 56 davon
         * mit mindestens 10 Partien. Das traegt.
         *
         * ACHTUNG, ZWEI SKALEN — und das laesst sich hier NICHT aufloesen.
         * Die Online-Zelle rechnet S/(S+N), die Labs-Datei liefert je
         * Paarung nur `vs_count` und `vs_win_pct`, und `vs_win_pct` sind
         * MATCHPUNKTE (3S+U)/3n. Ohne die Unentschieden je Paarung laesst
         * sich das nicht umrechnen, und die Quelle (labs) veroeffentlicht
         * sie nicht — der Scraper liest die zwei Zellen, die dastehen
         * (labs_tournament_scraper.py:1785).
         *
         * Wie gross der Unterschied ist, steht deshalb dabei. Gemessen ueber
         * die 90 Paarungen: Median -2,0 pp. Der reine Skaleneffekt bei
         * ausgeglichener Bilanz und 11 % Unentschieden (die Major-Quote)
         * betraegt -1,8 pp. Der Median ist also fast VOLLSTAENDIG Zaehlweise
         * und nicht Spielstaerke — wer das weiss, kann die Spalten
         * vergleichen; wer es nicht weiss, liest einen Einbruch, den es
         * nicht gibt. */
        window._majorMatchupRegistry = window._majorMatchupRegistry || null;
        let _majorLaeuft = false;

        /* Nach aussen gereicht, damit js/app-archetype-card.js dieselbe
           Datei nicht ein zweites Mal parst. Zwei Parser fuer eine Datei
           sind zwei Zahlen fuer eine Sache, sobald einer angefasst wird —
           dieselbe Begruendung, aus der getArchetypeShares() existiert.
           app-current-meta.js laedt vor app-archetype-card.js
           (index.html:3734 gegen :3745), der Verweis steht also. */
        window.ladeMajorMatchups = ladeMajorMatchups;

        async function ladeMajorMatchups() {
            if (window._majorMatchupRegistry) return window._majorMatchupRegistry;
            const leer = {};
            try {
                const fw = window._formatWindow;
                const alt = fw && fw.oldest_legal_set ? String(fw.oldest_legal_set).toUpperCase() : '';
                const neu = fw && fw.current_set ? String(fw.current_set).toUpperCase() : '';
                if (!alt || !neu) { window._majorMatchupRegistry = leer; return leer; }
                const key = `${alt}-${neu}`;
                const stamp = `?t=${Date.now()}`;
                // Erst das Verzeichnis fragen — sonst steht fuer ein Format
                // ohne Praesenzturnier bei jedem Seitenaufruf eine 404 in der
                // Konsole, die keine ist.
                const v = await fetch(`${BASE_PATH}labs_tournament_matchups_verzeichnis.json${stamp}`)
                    .then(r => r.ok ? r.json() : null).catch(() => null);
                if (!v || !Array.isArray(v.meta_keys) || v.meta_keys.indexOf(key) === -1) {
                    window._majorMatchupRegistry = leer; return leer;
                }
                const txt = await fetch(`${BASE_PATH}labs_tournament_matchups_${key}.csv${stamp}`)
                    .then(r => r.ok ? r.text() : '').catch(() => '');
                if (!txt) { window._majorMatchupRegistry = leer; return leer; }
                // KOMMA. Die Labs-Auszuege kommen aus einer anderen Quelle als
                // die eigenen Exporte; mit ';' zerfaellt die Datei zu Zeilen
                // mit einem Feld und alles faellt still auf leer zurueck.
                const parsed = (typeof Papa !== 'undefined' && Papa.parse)
                    ? Papa.parse(txt, { header: true, delimiter: ',', skipEmptyLines: true })
                    : { data: [] };
                const reg = {};
                for (const r of (parsed.data || [])) {
                    // Nur die Gesamtsicht, nicht Tag 1 / Tag 2 getrennt —
                    // sonst zaehlt dieselbe Partie mehrfach.
                    if (String(r.day_filter || '').trim() !== 'overall') continue;
                    const a = String(r.my_deck_name || '').trim();
                    const b = String(r.opponent_deck_name || '').trim();
                    if (!a || !b) continue;
                    const anzahl = parseInt(r.vs_count || '0', 10) || 0;
                    const punkte = parseLocaleNumber(r.vs_win_pct || '0', 0);
                    if (!anzahl) continue;
                    if (!reg[a]) reg[a] = {};
                    reg[a][b] = { anzahl, punkte };
                }
                window._majorMatchupRegistry = reg;
                return reg;
            } catch (_e) {
                window._majorMatchupRegistry = leer;
                return leer;
            }
        }

        // Render Interactive Matchup Heatmap
        function renderMatchupHeatmap() {
            /* Die Praesenzdaten einmal holen, dann neu zeichnen.
             *
             * Das Zeichnen bleibt synchron — es haengt an jedem Tastendruck
             * im Suchfeld, und ein `await` mittendrin wuerde die Reihenfolge
             * zweier schneller Eingaben vertauschen. Also: fehlt das
             * Register, wird OHNE Major-Zeile gezeichnet, und sobald es da
             * ist, einmal neu. Der Nutzer sieht die Tabelle sofort und die
             * zweite Zeile einen Wimpernschlag spaeter — statt einer
             * leeren Flaeche, bis eine Datei da ist, die er nicht bestellt
             * hat. */
            if (!_majorLaeuft && window._majorMatchupRegistry === null
                && typeof ladeMajorMatchups === 'function') {
                // Eigene Marke statt `_majorMatchupRegistry = {}`: ein leeres
                // Objekt ist truthy, und ladeMajorMatchups() haette dann
                // sofort aufgegeben, ohne je etwas zu holen.
                _majorLaeuft = true;
                ladeMajorMatchups().then(() => {
                    if (document.getElementById('matchupHeatmapContainer')) renderMatchupHeatmap();
                });
            }
            try {
                devLog('Rendering Matchup Heatmap...');

                const activeElement = document.activeElement;
                const activeHeatmapInputId = (activeElement && (activeElement.id === 'heatmapSearchY' || activeElement.id === 'heatmapSearchX'))
                    ? activeElement.id
                    : null;
                const activeSelectionStart = activeHeatmapInputId && typeof activeElement.selectionStart === 'number'
                    ? activeElement.selectionStart
                    : null;
                const activeSelectionEnd = activeHeatmapInputId && typeof activeElement.selectionEnd === 'number'
                    ? activeElement.selectionEnd
                    : null;
                
                // Initialize expanded state if not set
                if (typeof window.heatmapExpanded === 'undefined') {
                    window.heatmapExpanded = false;
                }
                
                // Collect matchup data from registry (fast path) or fallback to window scan
                const registry = window._matchupRegistry || {};
                let matchupData = {};
                if (Object.keys(registry).length > 0) {
                    matchupData = registry;
                } else {
                    const matchupVars = Object.keys(window).filter(k => k.startsWith('matchupData_'));
                    matchupVars.forEach(varName => {
                        const deckName = varName.replace('matchupData_', '').replace(/_/g, ' ');
                        matchupData[deckName] = window[varName];
                    });
                }
                
                if (Object.keys(matchupData).length === 0) {
                    console.warn('No matchup data available');
                    return;
                }
                
                // Normalize deck names consistently for matching/filtering (all apostrophe variants + spaces/hyphens).
                const normalizeName = (name) => name
                    ? String(name).toLowerCase().replace(/[\u2019\u2018\u201B'`´\s-]/g, '')
                    : '';
                
                const escapeAttr = (value) => String(value || '')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                /* DIE SUCHFELDER — drei Fehler auf einmal, gemeldet am 02.09.2026
                 * ("die Y-Achse und x-Achse Suchfilter funktionieren nicht
                 * vernuenftig"). An der laufenden Seite nachgestellt:
                 *
                 *   Ausgangslage        10 Zeilen · Feld ""
                 *   Y = "Dragapult"      5 Zeilen · Feld "dragapult"
                 *   Y geleert            5 Zeilen · Feld "dragapult"   <-- !
                 *
                 * 1. DAS FELD LIESS SICH NICHT LEEREN. Hier stand
                 *    `(input.value || window.heatmapSearchY || '')`. Ein
                 *    leerer Text ist falsy, also fiel der Ausdruck auf die
                 *    GESPEICHERTE vorige Suche zurueck. Wer den Filter
                 *    loeschte, bekam ihn sofort wieder — und im Feld stand
                 *    danach wieder, was er gerade geloescht hatte.
                 *    Jetzt entscheidet, ob das Feld EXISTIERT, nicht ob
                 *    etwas drinsteht.
                 *
                 * 2. DER TEXT WURDE KLEINGESCHRIEBEN. `.toLowerCase()` lief
                 *    auf dem Wert, der gleich wieder ins Feld geschrieben
                 *    wird — aus "Dragapult" wurde beim Tippen "dragapult".
                 *    Jetzt zwei Groessen: `anzeigeY` steht im Feld, `sucheY`
                 *    vergleicht.
                 *
                 * 3. ZWEI VERSCHIEDENE NORMALISIERER fuer dieselbe Sache.
                 *    Der Deckname wurde von ' ’ ‛ ` ´ Leerzeichen und
                 *    Bindestrich befreit, die Suche nur von ' ’ Leerzeichen
                 *    und Bindestrich. "N`s Zoroark" mit Gravis fand deshalb
                 *    nichts. Jetzt derselbe Ausdruck fuer beide Seiten. */
                const APOSTROPHE = /[\u2019\u2018\u201B'`´\s-]/g;
                const existingSearchYInput = document.getElementById('heatmapSearchY');
                const existingSearchXInput = document.getElementById('heatmapSearchX');
                const anzeigeY = (existingSearchYInput
                    ? existingSearchYInput.value
                    : (window.heatmapSearchY || '')).trim();
                const anzeigeX = (existingSearchXInput
                    ? existingSearchXInput.value
                    : (window.heatmapSearchX || '')).trim();
                window.heatmapSearchY = anzeigeY;
                window.heatmapSearchX = anzeigeX;
                const rawSearchY = anzeigeY.toLowerCase();
                const rawSearchX = anzeigeX.toLowerCase();
                const normalizedSearchY = rawSearchY.replace(APOSTROPHE, '');
                const normalizedSearchX = rawSearchX.replace(APOSTROPHE, '');
                /* Der ganze Behaelter wird bei jedem Tastendruck per
                 * outerHTML ersetzt — dabei stirbt das Eingabefeld und mit
                 * ihm der Fokus. Deshalb wird er hinterher zurueckgesetzt.
                 *
                 * BEFUND 02.09.2026: das geschah nur im Hauptpfad. Der
                 * Leerpfad ("Keine Decks gefunden") kehrt vorher zurueck und
                 * liess den Fokus liegen — ausgerechnet dort, wo man ihn am
                 * dringendsten braucht: nach einem Tippfehler steht man vor
                 * einer leeren Tabelle und kann ihn nicht verbessern, ohne
                 * das Feld neu anzuklicken. */
                const fokusZurueck = () => {
                    if (!activeHeatmapInputId) return;
                    requestAnimationFrame(() => {
                        const input = document.getElementById(activeHeatmapInputId);
                        if (!input) return;
                        input.focus({ preventScroll: true });
                        if (typeof activeSelectionStart === 'number' && typeof activeSelectionEnd === 'number') {
                            try {
                                input.setSelectionRange(activeSelectionStart, activeSelectionEnd);
                            } catch (e) {
                                // Auswahl laesst sich nicht immer setzen — der Fokus zaehlt.
                            }
                        }
                    });
                };

                const searchControlsHtml = `
                    <div id="heatmapSearchWrapper" class="heatmap-search-wrapper">
                        <div class="heatmap-search-row">
                            <label class="heatmap-search-label">
                                ${t('heatmap.yLabel')}
                                <input type="text" id="heatmapSearchY" value="${escapeAttr(anzeigeY)}" placeholder="${t('heatmap.placeholderY')}" oninput="if(typeof debouncedRenderHeatmap === 'function') debouncedRenderHeatmap();" class="heatmap-search-input">
                            </label>
                            <label class="heatmap-search-label">
                                ${t('heatmap.xLabel')}
                                <input type="text" id="heatmapSearchX" value="${escapeAttr(anzeigeX)}" placeholder="${t('heatmap.placeholderX')}" oninput="if(typeof debouncedRenderHeatmap === 'function') debouncedRenderHeatmap();" class="heatmap-search-input">
                            </label>
                        </div>
                    </div>
                `;
                
                // 2. DECK-LISTEN AUFTEILEN (X-Achse = Gegner, Y-Achse = Dein Deck)
                // The axis order used to depend on three globals that are
                // assigned NOWHERE in the project (currentMetaArchetypes /
                // metaArchetypes / currentMetaData), so metaDeckShareMap was
                // always empty; and the fallback read opp.matches / total /
                // totalMatches while the registry stores total_games, so that
                // was always 0 too. Both comparators returned 0 for every
                // pair and the axis simply kept CSV order. No visible damage
                // so far — the scraper happens to emit rank order — which is
                // exactly why it went unnoticed: the sorting silently
                // depended on its input already being sorted.
                const metaDecks = window.currentMetaArchetypes || window.metaArchetypes
                    || window.currentMetaData || [];
                let deckNames = Object.keys(matchupData);

                // PERFORMANCE: Build lookup map once (O(M)) instead of O(M) per comparator call during sort
                const metaDeckShareMap = new Map();
                metaDecks.forEach(d => {
                    // parseLocaleNumber, not parseFloat: these values can
                    // carry a decimal comma, and a parseFloat fallback would
                    // quietly reintroduce the truncation it is guarding
                    // against. app-utils.js loads before this file.
                    const share = parseLocaleNumber(d.share || d.percentage_in_archetype || 0, 0);
                    if (d.name) metaDeckShareMap.set(d.name, share);
                    if (d.archetype && d.archetype !== d.name) metaDeckShareMap.set(d.archetype, share);
                });
                
                const countGames = (row) => {
                    if (!row) return 0;
                    return Object.values(row).reduce((sum, opp) => sum + (
                        parseInt(opp.total_games ?? opp.matches ?? opp.total
                                 ?? opp.totalMatches ?? 0, 10) || 0), 0);
                };

                // Sortierung: Prio 1 = Meta-Share, Prio 2 = Anzahl Spiele
                deckNames.sort((a, b) => {
                    const shareA = metaDeckShareMap.get(a) ?? 0;
                    const shareB = metaDeckShareMap.get(b) ?? 0;
                    
                    if (shareA !== shareB && (shareA > 0 || shareB > 0)) {
                        return shareB - shareA;
                    }
                    
                    // Fallback: total games played. `total_games` is what
                    // buildMatchupRegistryFromCsv actually writes
                    // (js/app-meta-cards.js:1258); the older key names are
                    // kept for the legacy window-scan shape.
                    return countGames(matchupData[b]) - countGames(matchupData[a]);
                });
                
                const axisDeckLimit = (window.heatmapExpanded ? deckNames : deckNames.slice(0, 10));
                const matchesAxisSearch = (deckName, rawSearch, normalizedSearch) => {
                    const normalDeck = String(deckName || '').toLowerCase();
                    // Derselbe Ausdruck wie fuer die Suche oben — sonst
                    // findet ein Gravis im Decknamen seinen Gegenpart nicht.
                    const strippedDeck = normalDeck.replace(APOSTROPHE, '');
                    return normalDeck.includes(rawSearch) || strippedDeck.includes(normalizedSearch);
                };

                // X-Achse (Gegner): nur X-Suche beeinflusst X.
                const xDecks = rawSearchX
                    ? deckNames.filter(deck => matchesAxisSearch(deck, rawSearchX, normalizedSearchX))
                    : axisDeckLimit;

                // Y-Achse (dein Deck): nur Y-Suche beeinflusst Y.
                const yDecks = rawSearchY
                    ? deckNames.filter(deck => matchesAxisSearch(deck, rawSearchY, normalizedSearchY))
                    : axisDeckLimit;

                if (rawSearchY || rawSearchX) {
                    devLog(`Suche aktiv: Y='${rawSearchY || '-'}' (${yDecks.length}), X='${rawSearchX || '-'}' (${xDecks.length})`);
                }

                if (yDecks.length === 0 || xDecks.length === 0) {
                    const safeSearchDisplayY = rawSearchY.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const safeSearchDisplayX = rawSearchX.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    let emptyReason = t('heatmap.noDecks');
                    if (yDecks.length === 0 && rawSearchY) {
                        emptyReason = `${t('heatmap.noDecksY')} '${safeSearchDisplayY}'.`;
                    } else if (xDecks.length === 0 && rawSearchX) {
                        emptyReason = `${t('heatmap.noDecksX')} '${safeSearchDisplayX}'.`;
                    }
                    const emptyHtml = `
                        <div id="matchupHeatmapContainer" class="matchup-heatmap-container heatmap-container-std">
                            <h2 class="heatmap-title heatmap-title-std"><span class="heatmap-title-icon"></span> ${t('heatmap.title')}</h2>
                            ${searchControlsHtml}
                            <p class="heatmap-empty-reason">${emptyReason}</p>
                        </div>
                    `;

                    const existingContainer = document.getElementById('matchupHeatmapContainer');
                    if (existingContainer) {
                        existingContainer.outerHTML = emptyHtml;
                    } else {
                        const currentMetaContent = document.getElementById('currentMetaContent');
                        if (currentMetaContent) {
                            currentMetaContent.insertAdjacentHTML('afterbegin', emptyHtml);
                        }
                    }
                    fokusZurueck();
                    return;
                }
                
                devLog(`Heatmap-Decks: X-Achse=${xDecks.length}, Y-Achse=${yDecks.length}`);
                
                // 3. HTML GENERIEREN
                /* Die Tabellenbreite haengt jetzt an der SPALTENZAHL.
                 *
                 * BEFUND aus der Pruefrunde vom 01.09.2026, live bei 390 px
                 * nachgestellt: css/current-meta-matchups.css nagelte die
                 * Tabelle in vier Medienabfragen auf `width: 920px !important`.
                 * Wer auf zwei Decks filterte, bekam trotzdem 920 px — erste
                 * Spalte 550, Datenspalte 370, die Antwortzelle begann bei
                 * x = 579 in einem 332 px breiten Fenster. Sichtbar waren
                 * fuenf Decknamen und KEINE Zahl, ohne Bildlaufleiste und
                 * ohne Hinweis. Je genauer gefiltert, desto breiter die
                 * Spalten (`table-layout: fixed`).
                 *
                 * Genau die Frage, fuer die man zwischen zwei Runden zum
                 * Handy greift — und sie sah aus wie eine fertige Antwort
                 * ohne Daten. */
                let tableHtml = `<table class="heatmap-table" style="--heatmap-cols: ${xDecks.length};">`;
                tableHtml += `<colgroup><col class="heatmap-col-first">${xDecks.map(() => '<col class="heatmap-col-data">').join('')}</colgroup>`;
                
                // PERFORMANCE: Pre-compute normalized colDeck names (once per render, not per cell)
                const normalizedColDeckMap = new Map(xDecks.map(d => [d, normalizeName(d)]));
                
                // PERFORMANCE: Pre-build per-rowDeck normalized lookup maps (O(N+M) total vs O(N*M*K) inline)
                const rowLookupMaps = new Map();
                yDecks.forEach(rowDeck => {
                    const rowData = matchupData[rowDeck];
                    if (!rowData) return;
                    const lookup = new Map();
                    if (Array.isArray(rowData)) {
                        rowData.forEach(opp => {
                            const norm = normalizeName(opp.deck || opp.name || opp.archetype || opp.opponent || '');
                            if (norm) lookup.set(norm, opp);
                        });
                    } else {
                        Object.entries(rowData).forEach(([k, v]) => lookup.set(normalizeName(k), v));
                    }
                    rowLookupMaps.set(rowDeck, lookup);
                });

                /* Dieselbe Normalisierung wie fuer die Online-Seite: die
                   Labs-Namen sind meist deckungsgleich, aber nicht immer
                   (Apostrophe). Ohne das faende die Major-Zeile nichts und
                   die Spalte waere still leer — der Fehler, der die
                   Tier-Liste am 01.09. Worlds nicht sehen liess. */
                const majorReg = window._majorMatchupRegistry || {};
                const majorLookup = new Map();
                Object.keys(majorReg).forEach(a => {
                    const innen = new Map();
                    Object.keys(majorReg[a]).forEach(b => innen.set(normalizeName(b), majorReg[a][b]));
                    majorLookup.set(normalizeName(a), innen);
                });
                
                // Small helper: Pokémon-icon HTML for an archetype, empty
                // string when no mapping exists. Keeps the text label as
                // fallback when ArchetypeIcons is missing or unknown.
                const iconHtml = (name) => {
                    if (typeof window.ArchetypeIcons === 'undefined') return '';
                    const urls = window.ArchetypeIcons.getIconUrls(name);
                    if (!urls || !urls.length) return '';
                    const imgs = urls.map(u =>
                        `<img class="tcg-pokemon-icon tcg-pokemon-icon--sm" src="${u}" alt="" loading="lazy" onerror="this.style.display='none'">`
                    ).join('');
                    return urls.length > 1
                        ? `<span class="tcg-pokemon-icon-group tcg-pokemon-icon-group--inline">${imgs}</span>`
                        : imgs;
                };
                const escAttr = (s) => String(s).replace(/"/g, '&quot;');

                // Tabellenkopf (X-Achse mit Zeilenumbrüchen)
                tableHtml += '<thead><tr><th class="heatmap-th-x">' + t('heatmap.yourDeck') + '</th>';
                xDecks.forEach(colDeck => {
                    // Icons stacked above the wrapped name; title keeps full name on hover
                    const ic = iconHtml(colDeck);
                    const inner = ic
                        ? `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;">${ic}<span>${colDeck}</span></span>`
                        : colDeck;
                    tableHtml += `<th title="${escAttr(colDeck)}" class="heatmap-th-y">${inner}</th>`;
                });
                tableHtml += '</tr></thead><tbody>';

                // Tabellenzeilen (Y-Achse)
                yDecks.forEach(rowDeck => {
                    const rIc = iconHtml(rowDeck);
                    const rowLabel = rIc
                        ? `<span style="display:inline-flex;align-items:center;gap:6px;">${rIc}<span>${rowDeck}</span></span>`
                        : rowDeck;
                    tableHtml += `<tr><th class="heatmap-th-row" title="${escAttr(rowDeck)}">${rowLabel}</th>`;
                    const rowLookup = rowLookupMaps.get(rowDeck);
                    
                    xDecks.forEach(colDeck => {
                        // Mirror Match
                        if (normalizeName(rowDeck) === normalizedColDeckMap.get(colDeck)) {
                            tableHtml += '<td class="heatmap-td heatmap-td-mirror" title="' + t('heatmap.mirror') + '">\\</td>';
                            return;
                        }
                        
                        // O(1) lookup using pre-built map
                        const cellData = rowLookup ? (rowLookup.get(normalizedColDeckMap.get(colDeck)) ?? null) : null;
                        
                        if (!cellData) {
                            tableHtml += '<td class="heatmap-td heatmap-td-nodata" title="' + t('heatmap.noData') + '">-</td>';
                            return;
                        }
                        
                        // Parse record field "W - L - D" to extract wins/losses
                        let parsedWins = 0, parsedLosses = 0, parsedDraws = 0;
                        const recordStr = cellData.record || '';
                        if (recordStr) {
                            const parts = recordStr.split(/\s*-\s*/);
                            if (parts.length >= 2) {
                                parsedWins = parseInt(parts[0]) || 0;
                                parsedLosses = parseInt(parts[1]) || 0;
                                parsedDraws = parts.length >= 3 ? (parseInt(parts[2]) || 0) : 0;
                            }
                        }
                        // Fallback to explicit wins/losses fields if record not available
                        if (!recordStr && (cellData.wins !== undefined || cellData.losses !== undefined)) {
                            parsedWins = parseInt(cellData.wins) || 0;
                            parsedLosses = parseInt(cellData.losses) || 0;
                        }

                        // Flexibles Auslesen der Winrate
                        const winRateStr = cellData.winRate || cellData.winrate || cellData.win_rate || cellData.wr;
                        let winRate = parseFloat(winRateStr);
                        
                        // Fallback: Winrate selbst berechnen
                        if (isNaN(winRate) && (parsedWins + parsedLosses) > 0) {
                            winRate = (parsedWins / (parsedWins + parsedLosses)) * 100;
                        }
                        
                        if (isNaN(winRate)) {
                            tableHtml += '<td class="heatmap-td heatmap-td-nodata">-</td>';
                        } else {
                            const totalGames = parseInt(cellData.total_games) || (parsedWins + parsedLosses + parsedDraws);
                            // Angezeigt wird die geglaettete Quote, nicht der
                            // Rohwert. Der Median unserer Paarungen hat 16
                            // Partien, 55 % liegen unter 20 — roh stand in
                            // dieser Tabelle "100,0 %" auf einem 3-0.
                            // js/matchup-glaettung.js haelt die Formel, der
                            // Rohwert steht weiter im Tooltip.
                            const _G = window.DsGlaettung;
                            const winRateRoh = winRate;
                            if (_G) {
                                winRate = Number.isFinite(Number(cellData.win_rate_shrunk))
                                    ? Number(cellData.win_rate_shrunk)
                                    : _G.quote(parsedWins, parsedLosses);
                            }
                            let bgColor, textColor;
                            
                            // Blau <-> Rot mit grauem Nullpunkt, nicht Gruen <-> Rot.
                            //
                            // Die Heatmap war die dritte Stelle auf der Seite mit
                            // einer rot-gruenen Skala, und die schlimmste: hier
                            // steht die Farbe FUER die Aussage, nicht neben ihr.
                            // Wer Rot und Gruen nicht trennt, liest aus dieser
                            // Tabelle nichts. css/tokens.css hat die Entscheidung
                            // fuer die ganze Seite getroffen — die Werte hier sind
                            // --dv-pos (42,120,214) und --dv-neg (227,73,72).
                            //
                            // Und die Schrift traegt immer dieselbe Textfarbe. Die
                            // alte Fassung schaltete ab 65 % auf Weiss und ab 35 %
                            // auf Weiss um, was den Kontrast von der Zahl abhaengig
                            // machte. Getoente Zelle, feste Schrift: der Kontrast
                            // muss nie geprueft werden.
                            if (winRate >= 55.0) {
                                const intensity = Math.min((winRate - 55) / 20, 1);
                                bgColor = `rgba(42, 120, 214, ${0.12 + intensity * 0.34})`;
                                textColor = 'var(--ink)';
                                var tdClass = 'heatmap-td heatmap-td-fav';
                            } else if (winRate <= 45.0) {
                                const intensity = Math.min((45 - winRate) / 20, 1);
                                bgColor = `rgba(227, 73, 72, ${0.12 + intensity * 0.34})`;
                                textColor = 'var(--ink)';
                                var tdClass = 'heatmap-td heatmap-td-unfav';
                            } else {
                                bgColor = 'var(--surface-2)';
                                textColor = 'var(--ink-3)';
                                var tdClass = 'heatmap-td heatmap-td-even';
                            }
                            // Die Unentschieden gehören in den Tooltip, sonst
                            // geht die Bilanz nicht auf: 375W - 338L = 713, aber
                            // total_games = 720 (die 7 Unentschieden fehlten
                            // unbenannt). Gemessen am 21.08.2026 in 423 von 1546
                            // Zellen (27 %) ist W+L != total_games. Mit U aufgeführt
                            // summieren sich die genannten Zahlen sichtbar auf.
                            const tooltip = `${parsedWins}W - ${parsedLosses}L - ${parsedDraws}U (${totalGames} ${t('heatmap.games')}) · ${t('heatmap.raw')} ${winRateRoh.toFixed(1)} %`;
                            const safeRow = escapeJsStr(rowDeck);
                            const safeCol = escapeJsStr(colDeck);
                            // Inline sample-size below the WR. Cells with n<10 get a
                            // muted "low" tag so users can see at a glance which numbers
                            // are statistically thin (TrainerHill's confidence cue).
                            // Duenn wird ueber eine gestrichelte Umrandung
                            // gezeigt, nicht ueber Blaesse. Blaesse war der
                            // Grund fuer den Kontrast von 3,42:1 an genau
                            // diesen Zellen — die Information "wenig Partien"
                            // wurde bezahlt mit "schlechter lesbar". Die
                            // Strichelung traegt dieselbe Aussage und laesst
                            // den Kontrast in Ruhe. Schwelle 20, dieselbe wie
                            // THIN_GAMES in js/app-archetype-card.js.
                            const lowSample = totalGames < 20;
                            // "n=638" ist Rechnerjargon. Gemeldet am 19.08.2026:
                            // "n ist gleich sagt nichts aus … es muss fuer jeden
                            // von der Strasse klar sein, was sind hier die Daten,
                            // die ich sehen kann." Also steht da jetzt, was es ist.

                            /* Die Zelle traegt das kleine Kreuz aus der Skizze
                               des Betreibers (02.09.2026):

                                              online / Major
                                   Win Rate     xx  /  xx
                                   Matches      xx  /  xx

                               Vorher stand da "M 49,4 % \u00b7 52" unter der
                               Online-Zahl. R\u00fcckmeldung: "mit M kann man erstmal
                               nichts anfangen, man sollte da schon Major
                               ausschreiben vll geht eine Aufteilung ..." — und
                               die Skizze dazu.

                               F\u00fcnf Entw\u00fcrfe wurden gerendert und angesehen
                               (/tmp/hm), bevor einer in den Zweig kam. Der
                               Sieger ist die Skizze selbst: die beiden Win
                               Rates stehen NEBENEINANDER, nicht untereinander.
                               Genau darum ging es — "so sieht man schnell den
                               Unterschied zwischen online und Major
                               Ergebnissen" — und ein Vergleich nebeneinander
                               ist ein Blick, ein Vergleich untereinander ein
                               Sprung. Beide W\u00f6rter stehen in jeder Zelle;
                               90-mal "online"/"Major" zu lesen kostet nichts,
                               sich merken zu m\u00fcssen, welche Spalte welche ist,
                               kostet bei jedem Blick.

                               Der Major-Wert sind Matchpunkte, keine Siegquote
                               — die Quelle liefert je Paarung nur Anzahl und
                               Punkte. Der Versatz ist klein und systematisch
                               (Median -2,0 pp, davon -1,8 reine Z\u00e4hlweise) und
                               steht \u00fcber der Heatmap wie im Tooltip jeder
                               Zelle. Unter 10 Matches: kursiv. */
                            const mj = (majorLookup.get(normalizeName(rowDeck)) || new Map())
                                .get(normalizedColDeckMap.get(colDeck));
                            const majorDuenn = !!(mj && mj.anzahl < 10);
                            const pctTxt = (v) => (typeof window.formatPercent === 'function')
                                ? window.formatPercent(v) : Number(v).toFixed(1) + ' %';
                            const dk = majorDuenn ? ' heatmap-zelle-duenn' : '';
                            const zellenHtml = `<span class="heatmap-zelle">`
                                + `<span class="heatmap-zelle-ecke"></span>`
                                + `<span class="heatmap-zelle-quelle">${t('heatmap.onlineLabel')}</span>`
                                + `<span class="heatmap-zelle-quelle">${t('heatmap.majorLabel')}</span>`
                                + `<span class="heatmap-zelle-strich"></span>`
                                + `<span class="heatmap-zelle-kennzahl">${t('heatmap.wrLabel')}</span>`
                                + `<span class="heatmap-zelle-wr">${
                                    (typeof window.formatPercent === 'function')
                                        ? window.formatPercent(winRate) : winRate.toFixed(1) + ' %'}</span>`
                                + `<span class="heatmap-zelle-wr${dk}">${
                                    mj ? pctTxt(mj.punkte) : '\u2013'}</span>`
                                + `<span class="heatmap-zelle-kennzahl">${t('heatmap.gamesShort')}</span>`
                                + `<span class="heatmap-zelle-n">${totalGames}</span>`
                                + `<span class="heatmap-zelle-n${dk}">${
                                    mj ? mj.anzahl : '\u2013'}</span>`
                                + `</span>`;
                            const majorTip = mj
                                ? ` \u00b7 ${t('heatmap.majorTip')
                                    .replace('{w}', pctTxt(mj.punkte))
                                    .replace('{n}', String(mj.anzahl))}`
                                : ` \u00b7 ${t('heatmap.majorFehlt')}`;
                            const vollTip = tooltip + majorTip;
                            tableHtml += `<td class="${tdClass} heatmap-td-dyn${lowSample ? ' heatmap-td-thin' : ''}" style="--heatmap-bg: ${bgColor}; --heatmap-color: ${textColor};" title="${escAttr(vollTip)}" onclick="showToast('${safeRow} vs ${safeCol}: ${escapeJsStr(vollTip)}', 'info', 5000)">${zellenHtml}</td>`;
                        }
                    });
                    tableHtml += '</tr>';
                });
                tableHtml += '</tbody></table>';
                
                // Wrapper HTML
                let html = `
                    <div id="matchupHeatmapContainer" class="heatmap-container">
                        <h2 class="heatmap-title"><span style="font-size: 1.2em;"></span> ${t('heatmap.title')}</h2>
                        <p class="heatmap-desc">
                            ${t('heatmap.desc')}
                            <span class="heatmap-key heatmap-key-fav"></span> ${t('heatmap.favorable')} (≥ 55 %),
                            <span class="heatmap-key heatmap-key-even"></span> ${t('heatmap.even')} (45–54,9 %),
                            <span class="heatmap-key heatmap-key-unfav"></span> ${t('heatmap.unfavorable')} (≤ 45 %)
                        </p>
                        ${searchControlsHtml}
                        <div class="heatmap-table-scroll">
                            ${tableHtml}
                        </div>
                        <div class="heatmap-btn-row">
                            <button class="ds-btn" onclick="window.heatmapExpanded = !window.heatmapExpanded; renderMatchupHeatmap();">
                                ${window.heatmapExpanded ? t('heatmap.showTop10') : t('heatmap.showAll')}
                            </button>
                        </div>
                        <p class="heatmap-hint">
                            ${t('heatmap.hint')}
                        </p>
                    </div>
                `;
                
                // Insert or replace heatmap
                const existingContainer = document.getElementById('matchupHeatmapContainer');
                if (existingContainer) {
                    existingContainer.outerHTML = html;
                } else {
                    const currentMetaContent = document.getElementById('currentMetaContent');
                    if (currentMetaContent) {
                        currentMetaContent.insertAdjacentHTML('afterbegin', html);
                    }
                }

                fokusZurueck();
                
                devLog('Matchup Heatmap rendered successfully');
                
            } catch (error) {
                console.error('Error rendering Matchup Heatmap:', error);
            }
        }



        
        // Load Current Analysis
        async function loadCurrentAnalysis() {
            devLog('Loading Current Meta Analysis Tab...');
            
            // Load Current Meta HTML (for matchup data) if not already loaded
            if (!window.currentMetaLoaded) {
                devLog('Loading Current Meta HTML for matchup data...');
                await loadCurrentMeta();
            }
            
            // Load Current Meta Analysis (deck analysis)
            if (!window.currentMetaAnalysisLoaded) {
                await loadCurrentMetaAnalysis();
            }

            const metaGrid = document.getElementById('currentMetaMetaGrid');
            const shouldRefreshMetaAnalysis =
                !metaGrid ||
                !metaGrid.children.length ||
                /no data|load meta analysis|loading/i.test(metaGrid.textContent || '');
            if (shouldRefreshMetaAnalysis && typeof loadMetaCardAnalysis === 'function') {
                loadMetaCardAnalysis('currentMeta').catch(err => {
                    console.warn('[loadCurrentAnalysis] Auto-load meta analysis failed:', err);
                });
            }
            
            // Load saved deck from localStorage
            loadCurrentMetaDeck();
            
            window.currentAnalysisLoaded = true;
        }
        
        // LocalStorage functions for Current Meta
        function loadCurrentMetaDeck() {
            const saved = localStorage.getItem('currentMetaDeck');
            if (!saved) {
                devLog('No saved Current Meta deck found');
                return;
            }
            
            try {
                const data = JSON.parse(saved);
                devLog('Loaded Current Meta deck from localStorage:', data);
                
                if (data.deck) {
                    window.currentMetaDeck = data.deck;
                }
                if (data.order) {
                    window.currentMetaDeckOrder = data.order;
                }
                if (data.archetype) {
                    window.currentMetaArchetype = data.archetype;
                    // Pre-select archetype in dropdown if it exists (but don't display deck yet)
                    devLog('Saved archetype found:', data.archetype, '(waiting for user to select archetype)');
                }
                if (Array.isArray(data.pinned) && typeof window.pinnedCardsFromArray === 'function') {
                    window.pinnedCardsFromArray('currentMeta', data.pinned);
                }
                if (Array.isArray(data.excluded) && typeof window.excludedCardsFromArray === 'function') {
                    window.excludedCardsFromArray('currentMeta', data.excluded);
                }
                if (Array.isArray(data.techSlots) && typeof window.techSlotsFromArray === 'function') {
                    window.techSlotsFromArray('currentMeta', data.techSlots);
                }

                // DON'T automatically display deck - wait for archetype selection
                devLog('Current Meta Deck loaded but not displayed (waiting for archetype selection)');
            } catch (e) {
                console.error('Error loading Current Meta deck:', e);
            }
        }
        
        function saveCurrentMetaDeck() {
            try {
                const deck = window.currentMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('currentMetaDeck');
                    devLog('Current Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.currentMetaDeckOrder || [],
                    archetype: window.currentMetaArchetype || null,
                    pinned: typeof window.pinnedCardsToArray === 'function' ? window.pinnedCardsToArray('currentMeta') : [],
                    excluded: typeof window.excludedCardsToArray === 'function' ? window.excludedCardsToArray('currentMeta') : [],
                    techSlots: typeof window.techSlotsToArray === 'function' ? window.techSlotsToArray('currentMeta') : [],
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('currentMetaDeck', JSON.stringify(data));
                devLog('Current Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('Error saving Current Meta deck:', e);
            }
        }
        
        function loadPastMetaDeck() {
            try {
                const saved = localStorage.getItem('pastMetaDeck');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    window.pastMetaDeck = parsed.deck || {};
                    window.pastMetaDeckOrder = parsed.order || [];
                    window.pastMetaCurrentArchetype = parsed.archetype || null;
                    if (Array.isArray(parsed.pinned) && typeof window.pinnedCardsFromArray === 'function') {
                        window.pinnedCardsFromArray('pastMeta', parsed.pinned);
                    }
                    if (Array.isArray(parsed.excluded) && typeof window.excludedCardsFromArray === 'function') {
                        window.excludedCardsFromArray('pastMeta', parsed.excluded);
                    }
                    if (Array.isArray(parsed.techSlots) && typeof window.techSlotsFromArray === 'function') {
                        window.techSlotsFromArray('pastMeta', parsed.techSlots);
                    }
                    devLog('Loaded Past Meta deck from localStorage:', Object.keys(window.pastMetaDeck).length, 'cards');
                    return true;
                }
            } catch (e) {
                console.error('Error loading Past Meta deck:', e);
            }
            window.pastMetaDeck = {};
            window.pastMetaDeckOrder = [];
            window.pastMetaCurrentArchetype = null;
            return false;
        }
        
        function savePastMetaDeck() {
            try {
                const deck = window.pastMetaDeck || {};
                const deckSize = Object.keys(deck).length;
                
                // If deck is empty, remove from localStorage instead of saving empty object
                if (deckSize === 0) {
                    localStorage.removeItem('pastMetaDeck');
                    devLog('Past Meta deck is empty - removed from localStorage');
                    return;
                }
                
                const data = {
                    deck: deck,
                    order: window.pastMetaDeckOrder || [],
                    archetype: window.pastMetaCurrentArchetype || null,
                    pinned: typeof window.pinnedCardsToArray === 'function' ? window.pinnedCardsToArray('pastMeta') : [],
                    excluded: typeof window.excludedCardsToArray === 'function' ? window.excludedCardsToArray('pastMeta') : [],
                    techSlots: typeof window.techSlotsToArray === 'function' ? window.techSlotsToArray('pastMeta') : [],
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('pastMetaDeck', JSON.stringify(data));
                devLog('Past Meta deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('Error saving Past Meta deck:', e);
            }
        }

        // ── i18n: re-render on language change ──────────────────
        document.addEventListener('languageChanged', () => {
            // 29.08.2026: hier stand `matchupAnalysisModal` — das ist das
            // Modal des Battle Journals und traegt ein inline
            // display:none. Die Bedingung war damit IMMER falsch, und
            // die Heatmap wurde beim Sprachwechsel nie neu gezeichnet:
            // Achsenbeschriftungen, Titel, Platzhalter und Knoepfe
            // blieben in der alten Sprache stehen. Gemeint war der
            // Behaelter der Heatmap selbst.
            //
            // 30.08.2026: die Sichtbarkeitspruefung (offsetParent) war der
            // zweite Teil desselben Fehlers, nur umgekehrt. Wer beim
            // Umschalten NICHT auf der Startseite steht, hat eine
            // verborgene Heatmap: offsetParent ist null, es wird nichts
            // neu gezeichnet — und beim Zurueckkehren zeichnet niemand
            // nach, weil loadCurrentMeta() nur einmal laeuft
            // (window.currentMetaLoaded). Gemessen: Startseite verlassen,
            // auf EN schalten, zurueckkehren — 7 Beschriftungen deutsch
            // ("Matchup-Heatmap", "Y-Achse (Dein Deck)", ...), 91x
            // "Matches" statt "games" und 90 Prozentzahlen mit Komma
            // statt Punkt, also 130 veraltete Zeilen gegen einen frischen
            // EN-Ladevorgang derselben Ansicht.
            //
            // Von den beiden moeglichen Wegen — beim Wechsel auch
            // verborgene Ansichten nachziehen ODER beim Betreten pruefen —
            // ist hier der erste der richtige: renderMatchupHeatmap()
            // baut ausschliesslich aus window._matchupRegistry, also aus
            // Daten, die schon im Speicher liegen. Es faellt kein Netz an,
            // keine CSV wird nachgeladen, und der Ruecksprung bleibt
            // sofort korrekt statt erst nach einem weiteren Zeichenlauf.
            // Der zweite Weg braeuchte ausserdem einen Haken in
            // switchTab() (app-core.js), also eine Aenderung ausserhalb
            // dieses Moduls.
            //
            // Die Bedingung bleibt aber: nur nachziehen, was schon
            // GEZEICHNET ist. Existiert der Behaelter nicht, war die
            // Ansicht nie offen — dann darf ein Sprachwechsel sie auch
            // nicht befuellen und keine Daten anfordern.
            const behaelter = document.getElementById('matchupHeatmapContainer');
            const bereitsGezeichnet = !!behaelter;
            if (typeof renderMatchupHeatmap === 'function' && bereitsGezeichnet) renderMatchupHeatmap();
        });
        