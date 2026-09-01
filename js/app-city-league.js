// Saisonpause ist kein Fehler. Bis zum 17.08.2026 stand sie in einem roten
// Fehlerkasten (class="error") — alle drei Personas im Audit haben das als
// "die Seite ist kaputt" gelesen. Die JP-Rotation leert die Current-CSVs
// planmaessig; was fehlt, ist eine Erklaerung und ein Weiterweg, kein Alarm.
//
// Zwei Faelle, eine Meldung — das war zu wenig.
//
// "Saisonpause" stand am 20.08.2026 auf BEIDEN Reitern. Fuer das laufende
// Format ist die Aussage richtig: die Rotation auf M6 am 31.07. hat die
// Dateien planmaessig geleert (Commit b6ecb0ab). Fuer den Reiter
// "Vergangenes Meta" ist sie sachlich falsch — die Vergangenheit pausiert
// nicht. Dort fehlt der Schnappschuss: die Rotation hat auch die
// _past-Dateien geleert, und der Nachlauf hat nur
// city_league_analysis_past.csv wieder gefuellt (315 Zeilen, ein einziges
// Turnier, 23 Listen). city_league_archetypes_past.csv, aus der das
// Auswahlmenue gebaut wird, ist bis heute leer. Zwei Dateien desselben
// Fensters widersprechen sich, und der Reiter sagt "Pause".
//
// Und: "in der Regel wenige Tage nach dem Release" stand da, als das
// Release 20 Tage zurueck lag. Wer das liest, wartet auf etwas, das
// offenbar nicht kommt. Die Zahl der Tage steht jetzt dabei.
//
// data/format_window.json wird an vier Stellen im Haus geladen, aber
// nirgends abgelegt. Hier einmal holen und merken; fehlt sie, bleibt die
// Tagesangabe einfach weg — lieber keine Zahl als eine geratene.
var _clFormatFenster = null;
var _clAusgewichen = false;
(function ladeFormatFenster() {
    try {
        var basis = (typeof BASE_PATH === 'string' && BASE_PATH) ? BASE_PATH : 'data/';
        fetch(basis + 'format_window.json?t=' + Date.now())
            .then(function (r) { return r && r.ok ? r.json() : null; })
            .then(function (j) { _clFormatFenster = j || null; })
            .catch(function () { _clFormatFenster = null; });
    } catch (e) { _clFormatFenster = null; }
})();

function cityLeagueTageSeitRotation() {
    try {
        var w = _clFormatFenster;
        var d = w && w.jp_release_date ? new Date(w.jp_release_date + 'T00:00:00Z') : null;
        if (!d || isNaN(d.getTime())) return null;
        var tage = Math.floor((Date.now() - d.getTime()) / 86400000);
        return tage >= 0 ? tage : null;
    } catch (e) { return null; }
}

function cityLeagueOffSeasonHtml(istVergangenheit) {
    var de = (typeof getLang === 'function' && getLang() === 'de');
    // Der Ausweis oben bekam bis zum 20.08.2026 unbedingt pause:true — auch
    // fuer das VERGANGENE Fenster. Der Text darunter sagte schon richtig
    // "Die Vergangenheit pausiert nicht"; der Ausweis widersprach ihm im
    // selben Bild. Eine Saisonpause und ein fehlender Schnappschuss sind
    // zwei verschiedene Zustaende, und nur der erste ist ein Warten.
    if (window.DsNav) {
        try {
            window.DsNav.setSpaceFacts(istVergangenheit
                ? { pause: false, luecke: true }
                : { pause: true, luecke: false }, 'jp');
        } catch (e) {}
    }
    var tage = cityLeagueTageSeitRotation();
    var titel, text;
    if (istVergangenheit) {
        titel = de ? 'Kein Vergangenheits-Schnappschuss' : 'No past snapshot';
        text = de
            ? 'Die Set-Rotation hat auch die Vergangenheits-Dateien geleert, und der Nachlauf '
              + 'hat sie nicht wieder gefuellt. Die Vergangenheit pausiert nicht \u2014 hier fehlt '
              + 'schlicht der Schnappschuss des letzten vollständigen Zeitraums.'
            : 'The set rotation emptied the past-snapshot files as well, and the follow-up run '
              + 'never refilled them. The past does not pause \u2014 the snapshot of the last '
              + 'complete window is simply missing.';
        if (_clAusgewichen) {
            titel = de ? 'Keine City-League-Daten' : 'No City League data';
            text = (de
                ? 'Im laufenden Format ist noch kein Turnier gescrapt'
                  + (tage != null ? ' \u2014 die Rotation liegt ' + tage + ' Tage zurück' : '')
                  + '. Und der Vergangenheits-Schnappschuss fehlt ebenfalls: die Rotation hat '
                  + 'auch ihn geleert, der Nachlauf hat ihn nicht wieder gefuellt. '
                : 'No tournament in the current format has been scraped yet'
                  + (tage != null ? ' \u2014 the rotation was ' + tage + ' days ago' : '')
                  + '. And the past snapshot is missing as well: the rotation emptied it too and '
                  + 'the follow-up run never refilled it. ')
                + (de
                    ? 'Beide Ansichten sind deshalb leer \u2014 keine Zahl fehlt, es fehlen die Daten.'
                    : 'Both views are therefore empty \u2014 no number is missing, the data is.');
        }
    } else {
        titel = de ? 'Saisonpause in Japan' : 'Off-season in Japan';
        text = de
            ? 'Die City League pausiert zwischen zwei Set-Rotationen. Sobald das erste Turnier '
              + 'im neuen Format gescrapt ist, stehen die Zahlen hier wieder.'
            : 'The City League pauses between set rotations. Numbers return here as soon as the '
              + 'first tournament in the new format has been scraped.';
        if (tage != null) {
            text += de
                ? ' Die Rotation liegt ' + tage + ' Tage zurück; seither ist kein Turnier '
                  + 'im neuen Format gescrapt worden.'
                : ' The rotation was ' + tage + ' days ago; no tournament in the new format has '
                  + 'been scraped since.';
        }
    }
    return '<div class="ds-empty">' +
        '<div class="ds-empty-title">' + titel + '</div>' +
        '<p class="ds-empty-body">' + text + '</p>' +
        '<button type="button" class="ds-empty-cta" onclick="switchTabAndUpdateMenu(\'current-meta\')">' +
        (de ? 'Stattdessen das globale Meta ansehen' : 'Look at the global meta instead') +
        '</button></div>';
}
﻿// app-city-league.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // =======================================================================
        // ARCHETYPE NAME RESOLVER — fixes scraper inconsistency between
        // city_league_archetypes.csv (dropdown source) and
        // city_league_analysis.csv (cards source).
        //
        // The two scrapers can produce different names for the same physical
        // deck — most commonly a "Mega " prefix, apostrophe variants, or
        // case differences in trainer-Pokémon-decks ("Cynthia'S Garchomp"
        // vs "Cynthia's Garchomp"). When we filter cards by the
        // dropdown-selected archetype, an exact-match filter returns 0
        // rows even though the data is sitting in the CSV under a slightly
        // different label.
        //
        // _resolveArchetypeNames() takes the dropdown's targets + the set
        // of archetype names actually present in the cards data, and
        // returns the matching real names. Falls through three tiers:
        //   1. Exact match (current behaviour — preserves perf for the
        //      ~70% of decks where names already align).
        //   2. Lowercase + normalised apostrophes/whitespace.
        //   3. Same as (2) but ALSO strips an optional leading "mega ".
        //
        // Returns the actual archetype names found in the data, so
        // downstream filters (`row.archetype === target`) keep working
        // unchanged with the resolved values.
        // =======================================================================
        function _normalizeArchetypeForMatch(name) {
            return String(name || '')
                .trim()
                .toLowerCase()
                .replace(/['‘’‛`´ʼ]/g, "'")
                .replace(/\s+/g, ' ');
        }
        /**
         * "mega " streichen — wiederholt und auch mitten im Namen.
         *
         * Der City-League-Vergleichsscraper schreibt fuenf Archetypen mit
         * doppeltem Praefix: "Mega Mega Charizard-X Zoroark",
         * "Typhlosion Mega Mega Charizard-X". Das alte
         * `replace(/^mega /, '')` strich genau ein fuehrendes Vorkommen,
         * und beim Ziel "Typhlosion Mega Mega Charizard-X" steht das
         * Praefix nicht einmal vorn. Die fuenf blieben unaufloesbar, die
         * Kartenauswahl lieferte 0 Zeilen ohne jede Meldung (9 Decks).
         *
         * Die Ursache liegt im Scraper — dort entsteht das doppelte
         * Praefix, und dort gehoert sie behoben. Bis dahin faengt der
         * Aufloeser sie, statt still eine leere Liste zu zeigen.
         */
        function _normalizeArchetypeNoMega(name) {
            let n = _normalizeArchetypeForMatch(name);
            let vorher;
            do { vorher = n; n = n.replace(/\bmega mega\b/g, 'mega'); } while (n !== vorher);
            return n.replace(/^mega /, '');
        }
        function _resolveArchetypeNames(targets, dataArchetypes) {
            if (!Array.isArray(targets) || targets.length === 0) return [];
            const dataSet = (dataArchetypes instanceof Set)
                ? dataArchetypes
                : new Set(dataArchetypes || []);
            const exact = targets.filter(t => dataSet.has(t));
            if (exact.length === targets.length) return exact;

            // Build lookup maps from the data side so we can resolve targets
            // that don't exact-match. Each map: normalised → real name.
            const normMap = new Map();
            const noMegaMap = new Map();
            dataSet.forEach(real => {
                const n = _normalizeArchetypeForMatch(real);
                if (!normMap.has(n)) normMap.set(n, real);
                const m = _normalizeArchetypeNoMega(real);
                if (!noMegaMap.has(m)) noMegaMap.set(m, real);
            });

            const resolved = new Set(exact);
            targets.forEach(t => {
                if (resolved.has(t)) return;
                const n = _normalizeArchetypeForMatch(t);
                if (normMap.has(n))   { resolved.add(normMap.get(n)); return; }
                const m = _normalizeArchetypeNoMega(t);
                if (noMegaMap.has(m)) { resolved.add(noMegaMap.get(m)); return; }
                // Last-resort: the target as-is, even though it won't match
                // (preserves the previous "0 results" behaviour without
                // throwing — devLog surfaces the miss for diagnosis).
                if (typeof devLog === 'function') {
                    devLog('[archetype-resolver] no match for:', t, '— normalised:', n);
                }
                resolved.add(t);
            });
            return Array.from(resolved);
        }

        // =======================================================================
        // CITY LEAGUE FORMAT SWITCHING — Current vs Past
        // =======================================================================
        //
        // Two views:
        //   - 'current'  (label "Current Meta"): live City League data
        //   - 'past'     (label "Past Meta"):    frozen snapshot at the
        //                                       last JP-set rotation
        //
        // Legacy values 'M4' (current) and 'M3' (past) are auto-migrated
        // from localStorage on first read — see migrateLegacyFormat()
        // below. These values are semantic identifiers, not Pokémon
        // set codes; the actual JP rotation (M5 as of 2026-05-22) is
        // tracked separately in format_window.json.
        //
        // File pairs:
        //   Current:  city_league_analysis.csv,
        //             city_league_archetypes.csv,
        //             city_league_archetypes_comparison.csv
        //   Past:     city_league_analysis_past.csv,
        //             city_league_archetypes_past.csv,
        //             city_league_archetypes_past_comparison.csv
        //
        // Past files are auto-generated by the city_league_past_*_scrapers
        // when update_sets detects a JP-set rotation (see
        // backend/core/update_sets.apply_format_window_to_scraper_settings
        // and config/scraper_settings.json::city_league_analysis_past).
        // =======================================================================
        
        // Global variables for format management. The identifier values
        // are semantic ('current' = active JP rotation, 'past' = frozen
        // pre-rotation snapshot) — they were 'M4'/'M3' previously, which
        // looked like Pokémon set codes and collided with real set-code
        // checks elsewhere in the codebase. Legacy stored values are
        // migrated below on first read.
        (function migrateLegacyFormat() {
          const legacy = localStorage.getItem('cityLeagueFormat');
          if (legacy === 'M4') localStorage.setItem('cityLeagueFormat', 'current');
          else if (legacy === 'M3') localStorage.setItem('cityLeagueFormat', 'past');
        })();
        window.currentCityLeagueFormat = localStorage.getItem('cityLeagueFormat') || 'current';
        window.m3ArchetypeData = null; // Backward-compatible comparison data from the past snapshot
        window.m3BaselineData = {}; // Globales Dictionary fuer den Vergleich
        
        /**
         * Load M3 archetype data for comparison (only when in M4 mode)
         */
        async function loadM3ComparisonData() {
            if (window.m3ArchetypeData) return; // Already loaded
            
            try {
                const timestamp = new Date().getTime();
                const response = await fetch(`${BASE_PATH}city_league_archetypes_past_comparison.csv?t=${timestamp}`);
                if (response.ok) {
                    const text = await response.text();
                    const m3Data = parseCSV(text);
                    
                    // Convert to Map for quick lookup by archetype name
                    window.m3ArchetypeData = {};
                    m3Data.forEach(deck => {
                        const key = deck.archetype || deck.deck_name;
                        if (key) {
                            window.m3ArchetypeData[key] = {
                                // The scraper writes these two with decimal
                                // commas ("9,07" / "8,46" — see
                                // city_league_archetypes_comparison_M3.csv).
                                // The past-comparison file is empty right now,
                                // so this never fired; it would have truncated
                                // silently the moment it was filled. The other
                                // reader of the same fields (:426) already
                                // normalises — this is the one that did not.
                                share: parseLocaleNumber(deck.new_meta_share || deck.new_share || deck.share, 0),
                                avgPlacement: parseLocaleNumber(deck.new_avg_placement, 0),
                                count: parseInt(deck.new_count || 0)
                            };
                        }
                    });
                    devLog(`Loaded M3 comparison data: ${Object.keys(window.m3ArchetypeData).length} archetypes`);
                } else {
                    console.warn('M3 comparison data not available');
                }
            } catch (e) {
                console.warn('Could not load M3 comparison data:', e);
            }
        }
        
        /**
         * Switch between current and past meta formats.
         * Accepts both the new ('current'/'past') and legacy ('M4'/'M3')
         * values so old bookmarks / external callers don't break.
         */
        async function switchCityLeagueFormat(format) {
            if (format === 'M4') format = 'current';
            else if (format === 'M3') format = 'past';
            const selectMain = document.getElementById('cityLeagueFormatSelect');
            const selectAnalysis = document.getElementById('cityLeagueFormatSelectAnalysis');
            if (selectMain) selectMain.value = format;
            if (selectAnalysis) selectAnalysis.value = format;

            devLog(`Switching City League format to: ${format}`);
            
            // Store selection
            window.currentCityLeagueFormat = format;
            localStorage.setItem('cityLeagueFormat', format);
            
            // Show skeleton loader while data loads
            const content = document.getElementById('cityLeagueContent');
            if (content) {
                showTableSkeleton(content, { rows: 8, cols: 5, withImage: true });
            }
            
            // Load past-meta comparison data only when we're in 'current'
            // (so the tier banners can show trend arrows + 'past:' badges).
            // (Mobile-enabled: the extra ~80 KB is worth the at-a-glance
            // delta vs the prior rotation.)
            if (format === 'current') {
                await loadM3ComparisonData();
            }
            
            // Reload City League data with new format
            window.cityLeagueLoaded = false;
            window.cityLeagueAnalysisLoaded = false;
            await loadCityLeagueData();

            // Also refresh analysis tab data so the secondary format switch is globally usable
            await loadCityLeagueAnalysis();
        }
        
        // Load City League data from CSV (with cache-busting)
        let cityLeagueData = [];

        // Single source of truth for the "current-is-empty, fall back
        // to past" path. Sets the runtime format, syncs both dropdowns,
        // AND persists to localStorage so the next page load starts
        // straight at 'past' instead of flashing the error message
        // again while we recompute the fallback. The session-storage
        // key tracks that the fallback came from auto-detection (not
        // a user click) so we can still show the user "Current Meta"
        // as the resumed default once the season reopens — handled
        // out-of-band by the scraper writing fresh data; we just
        // notice the CSV is non-empty on the next load and stop
        // fallback-ing.
        function _applyCityLeaguePastFallback() {
            // Gemerkt, damit die Leermeldung sagen kann, dass BEIDES fehlt:
            // der Nutzer hat den laufenden Reiter geoeffnet und landet nach
            // dem Ausweichen im Vergangenheitsformat. Ohne diese Notiz
            // stuende "Kein Vergangenheits-Schnappschuss" ueber einer
            // Ansicht, nach der niemand gefragt hat.
            _clAusgewichen = true;
            window.currentCityLeagueFormat = 'past';
            try { localStorage.setItem('cityLeagueFormat', 'past'); } catch (_) { /* private mode */ }
            // Disable the "Current Meta" option in both dropdowns so a
            // second-click can't bounce the user back into the empty-
            // state error path. The season-pause banner above the
            // dropdown already explains why current is unavailable.
            // Re-enables itself naturally on the next page load once
            // the scraper writes a non-empty current CSV — fallback
            // never runs, this code never runs, options stay enabled.
            const _disableCurrent = (sel) => {
                if (!sel) return;
                sel.value = 'past';
                const currentOpt = sel.querySelector('option[value="current"]');
                if (currentOpt) {
                    currentOpt.disabled = true;
                    // Der Grund steht am Element, damit ihn auch die
                    // Knopfleiste (js/ds-filter.js) uebernehmen kann —
                    // sie baut sich aus genau diesen Optionen.
                    currentOpt.title = (typeof t === 'function')
                        ? t('cl.currentUnavailable')
                        : 'Saisonpause — aktuelle Daten nicht verfügbar';
                }
            };
            _disableCurrent(document.getElementById('cityLeagueFormatSelect'));
            _disableCurrent(document.getElementById('cityLeagueFormatSelectAnalysis'));
        }

        function deriveCityLeagueComparisonData(archetypesData) {
            if (!archetypesData || archetypesData.length === 0) return [];

            const grouped = new Map();
            archetypesData.forEach(row => {
                const archetype = (row.archetype || '').trim();
                if (!archetype) return;

                if (!grouped.has(archetype)) {
                    grouped.set(archetype, {
                        archetype,
                        count: 0,
                        placementSum: 0,
                        // Zähler und Nenner müssen dieselbe Menge beschreiben
                        // (20.08.2026).
                        //
                        // placementSum wurde nur über GÜLTIGE Platzierungen
                        // gebildet, geteilt wurde aber durch count, also durch
                        // ALLE Zeilen des Archetyps. Jede Zeile ohne Platzierung
                        // zog den Mittelwert damit um den Faktor
                        // (gültige / alle) nach unten — die Ø-Platzierung sah
                        // also besser aus, als sie ist.
                        //
                        // Heute schlägt es nicht durch: im geprüften Datenstand
                        // haben alle 8.693 Zeilen eine Platzierung. Es schlägt in
                        // der Sekunde durch, in der eine Zeile ohne kommt — und
                        // bei Turnier 568 fehlen bereits die Plätze 17, 18, 23,
                        // 29, 30 und 31. Genau in diesem Zustand fällt die
                        // Ansicht zudem auf DIESE Funktion zurück, weil die
                        // Vergleichsdatei leer ist.
                        //
                        // buildCityLeaguePlacementStatsMap in js/app-utils.js
                        // macht es seit jeher richtig, mit einem eigenen
                        // placementCount. Hier steht jetzt dasselbe.
                        placementCount: 0,
                        bestPlacement: Number.POSITIVE_INFINITY
                    });
                }

                const entry = grouped.get(archetype);
                const placement = parseInt(row.placement || '0', 10);
                entry.count += 1;
                if (!Number.isNaN(placement) && placement > 0) {
                    entry.placementSum += placement;
                    entry.placementCount += 1;
                    entry.bestPlacement = Math.min(entry.bestPlacement, placement);
                }
            });

            const totalCount = Array.from(grouped.values()).reduce((sum, entry) => sum + entry.count, 0);

            return Array.from(grouped.values())
                .map(entry => {
                    const metaShare = totalCount > 0 ? (entry.count / totalCount) * 100 : 0;
                    const avgPlacement = entry.placementCount > 0
                        ? (entry.placementSum / entry.placementCount) : 0;
                    return {
                        archetype: entry.archetype,
                        status: 'AKTUELL',
                        trend: 'STABIL',
                        old_count: String(entry.count),
                        new_count: String(entry.count),
                        count_change: '0',
                        old_meta_share: metaShare.toFixed(2).replace('.', ','),
                        new_meta_share: metaShare.toFixed(2).replace('.', ','),
                        meta_share_change: '0',
                        old_avg_placement: avgPlacement.toFixed(2).replace('.', ','),
                        new_avg_placement: avgPlacement.toFixed(2).replace('.', ','),
                        avg_placement_change: '0',
                        old_best: entry.bestPlacement === Number.POSITIVE_INFINITY ? '' : String(entry.bestPlacement),
                        new_best: entry.bestPlacement === Number.POSITIVE_INFINITY ? '' : String(entry.bestPlacement)
                    };
                })
                .sort((a, b) => parseInt(b.new_count || 0, 10) - parseInt(a.new_count || 0, 10));
        }

        // _autoFallbackDepth tracks how many times this call has
        // already auto-fallen-back from current → past in the same
        // recursion chain. 0 on the first user-triggered call; 1
        // after a season-pause fallback. Capped at 1 so we never
        // spin forever if the past snapshot is also empty. Using a
        // parameter instead of a module-level sentinel means a fresh
        // user-triggered call (e.g. dropdown switch to "Current")
        // always gets to try the fallback once, instead of being
        // permanently blocked by a flag set on the page's first load.
        // The season-pause banner (.cl-season-notice) is hidden by default
        // (CSS) and shown only when the CURRENT rotation has no City League
        // data — a genuine off-season gap. Once a current-window event lands
        // (e.g. a JP major pulled in via additional_tournament_ids), the
        // banner disappears on its own instead of lingering as a stale notice.
        /* Deutsche Zahlen tragen ein Komma.
         *
         * BEFUND (Schlussabnahme 30.08.2026): 40 sichtbare Textknoten der
         * City-League-Ansicht standen mit Punkt da — "Ø Rang 14.0",
         * "(+28.00)", "14.00" —, waehrend daneben "14,83" und "11,5 %"
         * korrekt gesetzt waren. Eine einzige Zelle mischte beides:
         * "28,0 (+28.00)".
         *
         * Der Vorrat an Helfern war da (js/app-tier-meta.js, parseLocale-
         * Number); er wurde an diesen Stellen nur nie benutzt. Deshalb
         * hier einer, der direkt neben den Ausgabestellen steht. */
        /* Mehrwortnamen brauchen mehr als den ersten Buchstaben.
         *
         * BEFUND (Schlussabnahme 30.08.2026): die Tabelle "Archetypen
         * kombiniert" zeigte "Mega venusaur" und "Mega greninja",
         * waehrend Heldenkachel und Vergleichstabelle derselben Ansicht
         * "Mega Venusaur" schrieben. Dieselbe Sache, drei Schreibweisen
         * auf einem Bildschirm — `d.main.charAt(0).toUpperCase()` hebt
         * nur den ERSTEN Buchstaben des ganzen Schluessels.
         *
         * js/app-tier-meta.js:673 macht es seit jeher richtig
         * (toTitleCaseWords); hier stand die kurze Fassung. */
        function _grossJedesWort(wert) {
            return String(wert || '')
                .split(' ')
                .filter(Boolean)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        }

        function _komma(zahl, stellen) {
            const n = Number(zahl);
            if (!isFinite(n)) return String(zahl == null ? '' : zahl);
            const text = n.toFixed(stellen == null ? 2 : stellen);
            return (typeof getLang === 'function' && getLang() === 'en')
                ? text
                : text.replace('.', ',');
        }
        /* Dasselbe fuer Werte, die schon als Zeichenkette vorliegen —
         * die abgeleiteten Vergleichsdaten schreiben "14.00" hinein. */
        /* BEFUND (Schlussabnahme 30.08.2026): auf einem Bildschirm
         * standen "14,83", "14,2", "12,0" und daneben in der
         * kombinierten Tabelle "14,00" und "14,20" — dieselbe Groesse
         * in zwei Genauigkeiten, weil die Vergleichsdaten ihre
         * Nachkommastellen so mitbringen, wie sie berechnet wurden.
         * Eine Ø-Platzierung hat hier immer zwei Nachkommastellen. */
        function _rang(wert) {
            /* NACHTRAG (Abnahmerunde 30.08.2026): der erste Anlauf pruefte
               nur auf einen PUNKT als Dezimaltrenner. Die abgeleiteten
               Vergleichsdaten schreiben ihre Werte aber bereits mit
               deutschem Komma hinein (Zeile 306: .replace('.', ',')),
               also fiel jede Zeile durch und blieb bei ihrer
               mitgelieferten Genauigkeit — "14,2" neben "14,83".
               Gemessen: 8 von 11 Zeilen einstellig. */
            const roh = String(wert == null ? '' : wert).trim();
            const punkt = roh.replace(',', '.');
            if (!/^-?\d+(\.\d+)?$/.test(punkt)) return _kommaText(wert);
            return _komma(Number(punkt), 2);
        }

        function _kommaText(wert) {
            const roh = String(wert == null ? '' : wert);
            if (typeof getLang === 'function' && getLang() === 'en') return roh;
            return /^-?\d+\.\d+$/.test(roh) ? roh.replace('.', ',') : roh;
        }

        function setCitySeasonNotice(show) {
            // BEFUND (Schlussabnahme 30.08.2026): hier stand
            // `el.style.display = show ? '' : 'none'`. Der Leerstring
            // ENTFERNT die Inline-Angabe und faellt auf die Stilvorgabe
            // zurueck — und die ist `display: none`
            // (css/city-league.css, .cl-season-notice). Die Meldung
            // konnte also NIE sichtbar werden.
            //
            // Gemessen: das style-Attribut war leer (die "Anzeigen"-
            // Aktion war also gelaufen), _clAusgewichen stand auf true,
            // und die Hoehe war 0 px. Von Hand auf `block` gesetzt sind
            // es 66 px mit dem fertigen Text "Saison-Pause: Die aktuelle
            // City-League-Saison ist beendet …".
            //
            // Der Text war geschrieben, richtig formuliert, wurde
            // ausgeloest — und hat den Nutzer nie erreicht. Genau in der
            // Lage, fuer die er gebaut wurde, schwieg die Seite.
            document.querySelectorAll('.cl-season-notice').forEach(el => {
                el.style.display = show ? 'block' : 'none';
            });
        }

        async function loadCityLeagueData(_autoFallbackDepth) {
            const _fallbackDepth = _autoFallbackDepth || 0;
            // Fresh (non-fallback) load: assume the season is live; the
            // empty-data branches below re-show the banner if it isn't.
            if (_fallbackDepth === 0) setCitySeasonNotice(false);
            const content = document.getElementById('cityLeagueContent');
            try {
                const timestamp = new Date().getTime();
                const isMobileRuntime = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
                
                // Dynamic file paths based on current format.
                // The format identifier is semantic: 'current' = active
                // rotation, 'past' = frozen pre-rotation snapshot. Past
                // files are auto-generated by the city_league_past_*
                // scrapers (file name suffix is '_past.csv').
                const format = window.currentCityLeagueFormat || 'current';
                const isPast = format === 'past';
                const analysisUrl   = `${BASE_PATH}${isPast ? 'city_league_analysis_past.csv'              : 'city_league_analysis.csv'}`;
                const archetypesUrl = `${BASE_PATH}${isPast ? 'city_league_archetypes_past.csv'            : 'city_league_archetypes.csv'}`;
                const comparisonUrl = `${BASE_PATH}${isPast ? 'city_league_archetypes_past_comparison.csv' : 'city_league_archetypes_comparison.csv'}`;
                // No separate _past variant — the current images JSON
                // accumulates archetype→image mappings across rotations.
                const imagesUrl = `${BASE_PATH}city_league_images.json`;
                const hasComparisonFile = true;

                devLog(`Loading City League data for format: ${format}`);

                // FCP-Optimierung: Lade nur kleine Dateien sofort (~880 KB statt 36 MB).
                // Die grosse Analysis-CSV wird im Hintergrund nachgeladen.
                const fetchPromises = [
                    fetch(`${imagesUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.json() : null)
                        .catch(error => {
                            console.warn(`Could not load images JSON (${imagesUrl}):`, error);
                            return null;
                        }),
                    fetch(`${archetypesUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.error(`Could not load archetypes data (${archetypesUrl}):`, error);
                            return null;
                        }),
                    hasComparisonFile
                        ? fetch(`${comparisonUrl}?t=${timestamp}`)
                            .then(response => response.ok ? response.text() : null)
                            .catch(error => {
                                console.warn(`Comparison file could not be loaded (${comparisonUrl}):`, error);
                                return null;
                            })
                        : Promise.resolve(null)
                ];

                // Load past-meta archetype data in the background when we're
                // on 'current' (mobile included — see switchCityLeagueFormat
                // note).
                if (window.currentCityLeagueFormat === 'current') {
                    fetchPromises.push(
                        fetch(`${BASE_PATH}city_league_archetypes_past.csv?t=${timestamp}`)
                            .then(response => response.ok ? response.text() : null)
                            .catch(() => null)
                    );
                }

                const results = await Promise.all(fetchPromises);
                const imageMap = results[0];
                const archetypesText = results[1];
                const comparisonText = results[2];
                const m3DataRaw = results.length > 3 ? results[3] : null;

                if (!archetypesText) {
                    // Current rotation has no data → genuine season pause;
                    // surface the banner (hidden by default).
                    if (format === 'current') setCitySeasonNotice(true);
                    // Same Season-pause fallback as the post-parse check
                    // below — if the current-rotation file is missing
                    // entirely (404, empty, or briefly stale during a
                    // GitHub Pages CDN propagation window), try the
                    // past-rotation snapshot instead of hard-failing.
                    if (format === 'current' && _fallbackDepth < 1) {
                        console.info('City League current-rotation CSV unavailable; falling back to past-rotation snapshot');
                        _applyCityLeaguePastFallback();
                        return loadCityLeagueData(_fallbackDepth + 1);
                    }
                    console.error('Hauptdaten fehlen fuer Format:', format);
                    content.innerHTML = cityLeagueOffSeasonHtml(format === 'past');
                    return;
                }

                // Hintergrund-Laden der grossen Analysis-CSV (non-blocking fuer FCP)
                window._cityLeagueAnalysisPromise = getCityLeagueAnalysisData(format, analysisUrl);

                const archetypesData = parseCSV(archetypesText);
                _captureKnownCityLeagueTournamentIds(archetypesData);
                const comparisonData = comparisonText ? parseCSV(comparisonText) : null;
                const placementStatsMap = buildCityLeaguePlacementStatsMap(archetypesData);

                // NEU: M3 Daten parsen und im globalen Objekt speichern
                if (m3DataRaw) {
                    const parsedM3 = parseCSV(m3DataRaw);
                    const aggregatedM3 = deriveCityLeagueComparisonData(parsedM3);
                    const m3PlacementStatsMap = buildCityLeaguePlacementStatsMap(parsedM3);
                    const enrichedM3 = enrichCityLeagueDataWithPlacementStats(aggregatedM3, m3PlacementStatsMap);
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = {};
                    enrichedM3.forEach(row => {
                        const deckName = row.name || row.archetype;
                        if (!deckName) return;

                        const normalizedAvgPlacement = (row.new_avg_placement || row.average_placement || row.avg_placement || '0').replace(',', '.');
                        const normalizedShare = (row.new_meta_share || row.new_share || row.share || row.percentage_in_archetype || '0').replace(',', '.');

                        window.m3BaselineData[deckName] = {
                            ...row,
                            average_placement: normalizedAvgPlacement,
                            avg_placement: normalizedAvgPlacement,
                            share: normalizedShare,
                            percentage_in_archetype: normalizedShare
                        };
                        window.m3ArchetypeData[deckName] = {
                            share: parseFloat(normalizedShare),
                            avgPlacement: parseFloat(normalizedAvgPlacement),
                            count: parseInt(row.new_count || '0', 10)
                        };
                    });
                } else {
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = {};
                }

                if (!archetypesData.length) {
                    // Current rotation parsed to zero rows → season pause;
                    // surface the banner (hidden by default).
                    if (format === 'current') setCitySeasonNotice(true);
                    // Season-pause fallback: when the current-rotation
                    // archetypes CSV is empty (Pause-Banner is showing
                    // for a reason — no new tournaments produced data
                    // this week) but a past-rotation snapshot is on
                    // disk, transparently switch to it instead of
                    // hard-failing. The banner already tells the user
                    // they're looking at the last snapshot, so the
                    // "show me City League data" intent still works.
                    if (format === 'current' && _fallbackDepth < 1) {
                        console.info('City League current-rotation CSV is empty (season pause); falling back to past-rotation snapshot');
                        _applyCityLeaguePastFallback();
                        return loadCityLeagueData(_fallbackDepth + 1);
                    }
                    console.info('City League: no main data for format', format, '— expected during the season pause (no tournaments running).');
                    content.innerHTML = cityLeagueOffSeasonHtml(format === 'past');
                    return;
                }

                cityLeagueData = comparisonData && comparisonData.length > 0
                    ? enrichCityLeagueDataWithPlacementStats(comparisonData, placementStatsMap)
                    : enrichCityLeagueDataWithPlacementStats(deriveCityLeagueComparisonData(archetypesData), placementStatsMap);

                // ── Ein Deck, drei Zeilen (20.08.2026) ──
                //
                // Die Quelle schreibt die Pokemon eines Archetyps in
                // wechselnder Reihenfolge. Gemessen am letzten
                // vollstaendigen Datenstand: 38 der 304 Namen sind ein
                // zweiter Schreibweg eines bereits vorhandenen.
                // "Ogerpon Raging-Bolt" (78 Listen) und "Raging-Bolt
                // Ogerpon" (31) sind dasselbe Deck — getrennt gezaehlt
                // fiel es von Rang 3 auf die Raenge 9, 16 und 50 und stand
                // gleichzeitig in Tier 2 und Tier 3.
                //
                // Zusammengelegt wird ueber archetypSchreibwegSchluessel:
                // nur Wortreihenfolge, nichts wird entfernt. Die Notiz
                // dort erklaert, warum das Entfernen von "Mega" gemessen
                // und verworfen wurde.
                //
                // Die Zusammenlegung passiert HIER und nicht im Scraper,
                // weil die schon vorhandenen Dateien sonst geteilt
                // blieben. Kommt sie spaeter in den Scraper, ist dieser
                // Schritt wirkungslos und schadet nicht — er findet dann
                // nichts mehr zusammenzulegen.
                if (typeof window.legeSchreibwegeZusammen === 'function') {
                    const zahlVon = (r) => parseInt(
                        String(r.new_count || r.count || r.old_count || 0).replace(',', '.'), 10) || 0;
                    const summe = (a, b) => {
                        const s = (String(a || '0').includes(','))
                            ? String(a).replace(',', '.') : a;
                        const t = (String(b || '0').includes(','))
                            ? String(b).replace(',', '.') : b;
                        return (parseFloat(s) || 0) + (parseFloat(t) || 0);
                    };
                    const erg = window.legeSchreibwegeZusammen(cityLeagueData, zahlVon, (ziel, quelle) => {
                        // Die Gewichte VOR dem Addieren merken. Sonst
                        // gewichtet die Platzierung weiter unten mit der
                        // bereits zusammengezaehlten Listenzahl — bei 78
                        // gegen 31 kam damit 8,18 statt 8,20 heraus. Vom
                        // Test gefunden, nicht beim Lesen.
                        const nZiel = zahlVon(ziel), nQuelle = zahlVon(quelle);
                        // Stueckzahlen addieren.
                        ['new_count', 'old_count', 'count'].forEach(k => {
                            if (ziel[k] != null || quelle[k] != null) {
                                ziel[k] = String(Math.round(summe(ziel[k], quelle[k])));
                            }
                        });
                        // Anteile addieren (deutsches Komma erhalten).
                        ['new_meta_share', 'old_meta_share', 'share'].forEach(k => {
                            if (ziel[k] != null || quelle[k] != null) {
                                ziel[k] = summe(ziel[k], quelle[k]).toFixed(2).replace('.', ',');
                            }
                        });
                        // Platzierungen: nach Listenzahl GEWICHTET mitteln.
                        // Ein einfacher Mittelwert der zwei Mittelwerte
                        // waere falsch, sobald die Zeilen verschieden gross
                        // sind — und das sind sie hier immer (78 gegen 31).
                        ['new_avg_placement', 'old_avg_placement', 'average_placement'].forEach(k => {
                            const pz = parseFloat(String(ziel[k] || '0').replace(',', '.')) || 0;
                            const pq = parseFloat(String(quelle[k] || '0').replace(',', '.')) || 0;
                            const nz = nZiel, nq = nQuelle;
                            if (pz > 0 && pq > 0 && (nz + nq) > 0) {
                                ziel[k] = ((pz * nz + pq * nq) / (nz + nq)).toFixed(2).replace('.', ',');
                            } else if (pq > 0 && !(pz > 0)) {
                                ziel[k] = quelle[k];
                            }
                        });
                        // Beste Platzierung ist ein Minimum, kein Mittel.
                        ['new_best', 'old_best', 'best_placement'].forEach(k => {
                            const bz = parseInt(ziel[k], 10), bq = parseInt(quelle[k], 10);
                            if (Number.isFinite(bq)) {
                                ziel[k] = String(Number.isFinite(bz) ? Math.min(bz, bq) : bq);
                            }
                        });
                        // Und die zusammengelegten Schreibweisen mitfuehren,
                        // damit die Karte sie nennen kann.
                        ziel._schreibwege = (ziel._schreibwege || [ziel.archetype])
                            .concat(quelle.archetype);
                    });
                    if (erg.zusammengelegt > 0) {
                        console.info('[City League] %d Schreibweisen zu %d Archetypen zusammengelegt '
                            + '(%d Zeilen statt %d) — nur Wortreihenfolge, nichts entfernt.',
                            erg.zusammengelegt, erg.gruppen, erg.zeilen.length, cityLeagueData.length);
                    }
                    cityLeagueData = erg.zeilen;
                }

                if (!comparisonData || comparisonData.length === 0) {
                    console.warn(`Comparison data missing for ${format}; using derived fallback from archetypes data`);
                }

                // Load past-meta comparison data when format is 'current'
                // (mobile included — see notes in switchCityLeagueFormat /
                // loadCityLeagueData).
                if (format === 'current') {
                    await loadM3ComparisonData();
                } else {
                    window.m3BaselineData = {};
                    window.m3ArchetypeData = null;
                }
                
                // Load tournament count and date range from main archetype CSV
                let tournamentCount = 0;
                let dateRange = '';
                try {
                    const uniqueTournaments = new Set(archetypesData.map(d => d.tournament_id));
                    tournamentCount = uniqueTournaments.size;
                    
                    // Extract date range with proper date parsing
                    if (archetypesData.length > 0) {
                        const dates = archetypesData.map(d => d.date).filter(d => d);
                        if (dates.length > 0) {
                            /* BEFUND (Schlussabnahme 30.08.2026): in der
                             * deutschen Oberflaeche stand "Zeitraum:
                             * 6th June 2026 - 6th June 2026" — die
                             * Rohzeichenkette aus der CSV, englisch, mit
                             * Ordnungszahl-Endung, durchgereicht.
                             *
                             * Und die Sortierung daneben war auch falsch:
                             * die Monatstabelle kannte nur Kurzformen
                             * ("Jun"), die Datei schreibt aber "June" —
                             * jeder Monat fiel auf '01'. Dazu wurde ein
                             * '20' vor das Jahr geklebt, aus "2026" also
                             * "202026". Bei einem einzigen Datum faellt
                             * das nicht auf; bei zweien waere der
                             * Zeitraum vertauscht gewesen.
                             *
                             * Jetzt: einmal richtig lesen, dann in der
                             * Sprache des Nutzers ausgeben. */
                            const parsedDates = dates.map(d => {
                                const m = String(d).match(
                                    /^\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\s*$/);
                                if (!m) return { original: d, datum: null, comparable: '99999999' };
                                const monate = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
                                                 jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
                                const mi = monate[m[2].slice(0, 3).toLowerCase()];
                                if (mi == null) return { original: d, datum: null, comparable: '99999999' };
                                const datum = new Date(Date.UTC(Number(m[3]), mi, Number(m[1])));
                                return {
                                    original: d,
                                    datum,
                                    comparable: m[3] + String(mi + 1).padStart(2, '0')
                                                     + m[1].padStart(2, '0'),
                                };
                            });

                            const minDateObj = parsedDates.reduce((a, b) => a.comparable < b.comparable ? a : b);
                            const maxDateObj = parsedDates.reduce((a, b) => a.comparable > b.comparable ? a : b);
                            const _schema = (typeof getLang === 'function' && getLang() === 'en')
                                ? 'en-GB' : 'de-DE';
                            const zeige = (o) => o.datum
                                ? o.datum.toLocaleDateString(_schema,
                                    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
                                : o.original;
                            dateRange = (minDateObj.comparable === maxDateObj.comparable)
                                ? zeige(minDateObj)
                                : `${zeige(minDateObj)} – ${zeige(maxDateObj)}`;
                        }
                    }
                } catch (e) {
                    console.warn('Could not load tournament data:', e);
                }
                
                window._cityLeagueTournamentCount = tournamentCount;
                window._cityLeagueDateRange = dateRange;
                renderCityLeagueTable(tournamentCount, dateRange);

                // Keep the analysis dropdown in sync with the freshly loaded format data
                // analysisData wird im Hintergrund geladen (window._cityLeagueAnalysisPromise)
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = cityLeagueData;
                window.cityLeagueImageMap = imageMap;
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect([], cityLeagueData);

                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                // populateCityLeagueDeckSelect may have applied a pending selection — respect it
                const currentValue = deckSelect ? deckSelect.value : '';
                let restoredSelection = currentValue; // already set by pending
                if (!currentValue && deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                        restoredSelection = previousDeckValue;
                        syncSearchableSelectDisplay(deckSelect);
                    }
                }
                if (!restoredSelection && deckSelect) {
                    deckSelect.value = '';
                }

                if (restoredSelection) {
                    // Reload analysis for the restored deck with the new data
                    loadCityLeagueDeckData(restoredSelection);
                } else {
                    clearCityLeagueDeckView();
                }
                
                // Render tier list banner view (uses pre-computed imageMap fuer schnelles FCP)
                await renderCityLeagueTierList(null, imageMap);
                
                window.cityLeagueLoaded = true;
            } catch (error) {
                console.error('Error loading City League data:', error);
                // Only show the error message if no usable content was
                // rendered yet — otherwise a late-stage throw (e.g. a
                // non-critical post-render hook) would nuke a perfectly
                // good past-rotation fallback render. We check for the
                // signature elements the tier-list / table renders emit;
                // their presence means content.innerHTML was written
                // successfully at some point before the throw.
                const renderedSomething = content && content.querySelector(
                    '.deck-banner-card, .tier-section, .tier-hero-card, .city-league-table-wrap, .meta-share-section'
                );
                if (content && !renderedSomething) {
                    content.innerHTML = cityLeagueOffSeasonHtml(
                        (window.currentCityLeagueFormat || 'current') === 'past');
                }
            }
        }
        
        // Cached city league sort results (invalidated when data changes)
        let _cityLeagueSortCache = null;
        let _cityLeagueSortDataRef = null;

        function getCityLeagueSortedSections(data) {
            // Return cached result if data reference hasn't changed
            if (_cityLeagueSortCache && _cityLeagueSortDataRef === data) return _cityLeagueSortCache;
            
            /* BEFUND (Schlussabnahme 30.08.2026): gibt es GAR KEINEN
             * Vorzeitraum, erfindet der Vergleich Aussagen.
             *
             * In data/city_league_archetypes_past_comparison.csv tragen
             * alle 11 Zeilen status=NEU und old_count=0. Daraus wurde
             * `avg_placement_change = new_avg - 0`, also fuer JEDE Zeile
             * eine "Verschlechterung" — und die Oberflaeche baute daraus
             * die Rubrik "Performance verschlechtert (schlechtere
             * Ø-Platzierung)" mit 10 Zeilen, darunter "Slowking 8,0
             * (+8.00)". Eine Ø-Platzierung von 8,0 ist gut; verschlechtert
             * hat sich nichts, weil es nichts gab, wogegen.
             *
             * Gleichzeitig meldete die Karte daneben "Keine Veraenderungen
             * in den Top 10": top10Old sortiert nach old_count, das fuer
             * alle Zeilen 0 ist. Array.prototype.sort ist stabil, also
             * blieb die CSV-Reihenfolge stehen — und die ist schon nach
             * new_count sortiert. Alte und neue Rangliste waren identisch.
             *
             * Zwei sich widersprechende Aussagen aus einer Datengrundlage,
             * die fuer keine von beiden traegt. Also sagen wir es. */
            const keinVorzeitraum = data.length > 0
                && data.every(d => (parseInt(d.old_count || 0, 10) || 0) === 0);

            const newArchetypes = data.filter(d => d.status === 'NEU');
            const disappeared = data.filter(d => d.status === 'VERSCHWUNDEN');
            const increased = data.filter(d => d.status !== 'NEU' && parseInt(d.count_change || 0) > 0)
                .sort((a, b) => parseInt(b.count_change) - parseInt(a.count_change));
            const decreased = data.filter(d => parseInt(d.count_change || 0) < 0)
                .sort((a, b) => parseInt(a.count_change) - parseInt(b.count_change));
            
            const maxCountForThreshold = Math.max(...data.map(d => parseInt(d.new_count || 0)));
            const countThreshold = maxCountForThreshold * 0.1;
            
            const improvers = data
                .filter(d => parseLocaleNumber(d.avg_placement_change || '0', 0) < 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseLocaleNumber(a.avg_placement_change || '0', 0) - parseLocaleNumber(b.avg_placement_change || '0', 0))
                .slice(0, 10);
            
            const decliners = data
                .filter(d => parseLocaleNumber(d.avg_placement_change || '0', 0) > 0 && parseInt(d.new_count || 0) >= countThreshold)
                .sort((a, b) => parseLocaleNumber(b.avg_placement_change || '0', 0) - parseLocaleNumber(a.avg_placement_change || '0', 0))
                .slice(0, 10);
            
            const sorted = [...data].sort((a, b) => parseInt(b.new_count || 0) - parseInt(a.new_count || 0));
            
            // PERFORMANCE: compute and cache all derived sorts here so renderCityLeagueTable never re-sorts
            const topByCount = sorted.slice(0, 3);
            const maxCount = parseInt(topByCount[0]?.new_count || 0);
            const minCountThreshold = maxCount * 0.1;
            const topByPlacement = [...data]
                .filter(d => parseInt(d.new_count || 0) >= minCountThreshold)
                .sort((a, b) => parseLocaleNumber(a.new_avg_placement || '0', 0) - parseLocaleNumber(b.new_avg_placement || '0', 0))
                .slice(0, 3);
            const top10New = sorted.slice(0, 10).map(d => d.archetype);
            const top10Old = [...data]
                .sort((a, b) => parseInt(b.old_count || 0) - parseInt(a.old_count || 0))
                .slice(0, 10).map(d => d.archetype);
            
            _cityLeagueSortDataRef = data;
            _cityLeagueSortCache = {
                newArchetypes, disappeared, increased, decreased,
                // Ohne Vorzeitraum gibt es nichts zu vergleichen. Lieber
                // keine Rubrik als eine erfundene.
                improvers: keinVorzeitraum ? [] : improvers,
                decliners: keinVorzeitraum ? [] : decliners,
                sorted, topByCount, topByPlacement, top10New,
                top10Old: keinVorzeitraum ? [] : top10Old,
                keinVorzeitraum,
            };
            return _cityLeagueSortCache;
        }
        
        // Render City League table with full structure matching original HTML
        function renderCityLeagueTable(tournamentCount = 0, dateRange = '') {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Use cached sort results
            const { newArchetypes, disappeared, increased, decreased, improvers, decliners, sorted, topByCount, topByPlacement, top10New, top10Old, keinVorzeitraum } = getCityLeagueSortedSections(cityLeagueData);
            const totalArchetypes = cityLeagueData.length;
            
            // Generate timestamp
            const now = new Date();
            // BEFUND (Schlussabnahme 30.08.2026): 'de-DE' stand hier fest,
            // also zeigte auch die englische Fassung "30.08.2026, 14:35:23".
            const _gebietsschema = (typeof getLang === 'function' && getLang() === 'en')
                ? 'en-GB' : 'de-DE';
            const generatedDate = now.toLocaleString(_gebietsschema, { 
                year: 'numeric', month: '2-digit', day: '2-digit', 
                hour: '2-digit', minute: '2-digit', second: '2-digit' 
            });
            
            const maxCount = parseInt(topByCount[0]?.new_count || 0);
            
            // Ohne Vorzeitraum ist auch "aufgestiegen" eine Behauptung:
            // top10Old ist leer, also waere JEDER Archetyp ein Aufsteiger.
            // Das stuende dann direkt ueber dem Satz, der sagt, dass es
            // nichts zu vergleichen gibt.
            const entries = keinVorzeitraum ? [] : top10New.filter(arch => !top10Old.includes(arch));
            const exits = keinVorzeitraum ? [] : top10Old.filter(arch => !top10New.includes(arch));
            
            let html = `
                <div id="cityLeagueTierSections"></div>
                <div class="city-league-info-grid">
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.archetypeOverview')}</h3>
                        <div class="city-league-info-card-total">${totalArchetypes}</div>
                        <div class="city-league-info-card-details">
                            <strong>${t('cl.top3Count')}</strong><br>
                            ${topByCount.map(d => `${d.archetype}: ${d.new_count}x`).join('<br>')}
                            <br><br>
                            <strong>${t('cl.top3Placement')}</strong><br>
                            ${topByPlacement.map(d => `${d.archetype}: ${d.new_avg_placement}`).join('<br>')}
                        </div>
                    </div>
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.top10Changes')}</h3>
                        <div class="city-league-info-card-details">
                            ${entries.length > 0 ? `<strong class="city-league-info-card-entry">+ ${t('cl.entries')}</strong><br>${entries.map(arch => `${arch}`).join('<br>')}<br><br>` : ''}
                            ${exits.length > 0 ? `<strong class="city-league-info-card-exit">- ${t('cl.exits')}</strong><br>${exits.map(arch => `${arch}`).join('<br>')}<br>` : ''}
                            ${keinVorzeitraum ? t('cl.noBaseline') : (entries.length === 0 && exits.length === 0 ? t('cl.noTop10Changes') : '')}
                        </div>
                    </div>
                    <div class="city-league-info-card">
                        <h3 class="city-league-info-card-title">${t('cl.dataSource')}</h3>
                        <div class="city-league-info-card-details">
                            <strong>${t('cl.period')}</strong><br>${dateRange || 'N/A'}<br><br>
                            <strong>${t('cl.tournaments')}</strong><br>${tournamentCount || 0}
                        </div>
                    </div>
                </div>`;
            
            // Add conditional tables
            if (decreased.length > 0) {
                html += `
                    <div class="city-league-info-table-block">
                        <h2 class="city-league-info-table-title">${t('cl.popDecreases')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thOldCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thNewCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thChange')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacement')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decreased.slice(0, 10).forEach(d => {
                    const change = parseInt(d.count_change || 0);
                    const placement_change = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const placement_color = placement_change < 0 ? 'var(--tint-ok-ink)' : 'var(--tint-bad-ink)';
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.getIconHtml(d.archetype,{size:'sm',layout:'inline'}):'')}${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.old_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-exit">${change}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${_rang(d.new_avg_placement)} ${(parseInt(d.old_count || 0, 10) || 0) === 0 ? '' : `<span class="city-league-info-table-placement" style="--placement-color: ${placement_color};">(${placement_change > 0 ? '+' : ''}${_komma(placement_change, 2)})</span>`}</td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (improvers.length > 0 || decliners.length > 0) {
                // Container for side-by-side layout (Desktop) / stacked (Mobile)
                html += `<div class="city-league-info-flex">`;
            }
            
            if (improvers.length > 0) {
                // Performance Improvers
                html += `
                    <div class="city-league-info-flex-block">
                        <h2 class="city-league-info-table-title">${t('cl.perfImprovers')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                improvers.slice(0, 10).forEach(d => {
                    const improvement = Math.abs(parseLocaleNumber(d.avg_placement_change || '0', 0));
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.getIconHtml(d.archetype,{size:'sm',layout:'inline'}):'')}${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count} <span class="city-league-info-table-count-change">(${countChangeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-entry">${_rang(d.new_avg_placement)} <span class="city-league-info-table-placement" style="--placement-color: var(--tint-ok-ink);">(-${_komma(improvement, 2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            if (decliners.length > 0) {
                // Performance Decliners
                html += `
                    <div class="city-league-info-flex-block">
                        <h2 class="city-league-info-table-title">${t('cl.perfDecliners')}</h2>
                        <table class="city-league-info-table">
                            <thead>
                                <tr class="city-league-info-table-header-row">
                                    <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                                    <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                                </tr>
                            </thead>
                            <tbody>`;
                decliners.slice(0, 10).forEach(d => {
                    const decline = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const countChange = parseInt(d.new_count) - parseInt(d.old_count);
                    const countChangeText = countChange > 0 ? `+${countChange}` : `${countChange}`;
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    html += `
                        <tr class="city-league-info-table-row">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.getIconHtml(d.archetype,{size:'sm',layout:'inline'}):'')}${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center">${d.new_count} <span class="city-league-info-table-count-change">(${countChangeText})</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-exit">${_rang(d.new_avg_placement)} <span class="city-league-info-table-placement" style="--placement-color: var(--tint-bad-ink);">(+${_komma(decline, 2)})</span></td>
                        </tr>`;
                });
                html += `</tbody></table></div>`;
            }
            
            // Close flex container if it was opened
            if (improvers.length > 0 || decliners.length > 0) {
                html += `</div>`; // Close flex container
            }
            
            // Full comparison tables - side by side on Desktop
            html += `
                <div class="city-league-info-flex">
                    <!-- Full Comparison Table (Detailed) -->
                    <div class="city-league-info-flex-block city-league-info-flex-block-wide">
                        <h2 class="city-league-info-table-title">${t('cl.fullComparison')}</h2>
                        <div class="city-league-info-search-block">
                            <input type="text" id="cityLeagueSearchFilter" aria-label="${escapeHtml(t('cl.searchAria'))}" placeholder="${t('cl.searchPlaceholder')}" class="city-league-info-search-input" oninput="debouncedFilterCityLeagueTable()">
                            <div id="cityLeagueSearchResults" class="city-league-info-search-results"></div>
                        </div>
                        <div id="cityLeagueFullTable"></div>
                    </div>
                    <!-- Grouped by Main Pokemon -->
                    <div class="city-league-info-flex-block city-league-info-flex-block-wide">
                        <h2 class="city-league-info-table-title">${t('cl.archetypeCombined')}</h2>
                        <div class="city-league-info-combined-explanation">
                            ${t('cl.combinedExplanation')}
                        </div>
                        <div id="cityLeagueCombinedTable"></div>
                    </div>
                </div>
                <div class="city-league-info-generated-block">
                    <span class="city-league-info-generated-date">${t('cl.generated')} ${generatedDate}</span>
                    <span class="city-league-info-generated-total">${t('cl.totalTracked')} ${totalArchetypes}</span>
                </div>`;
            
            content.innerHTML = html;
            
            // Store sorted data globally for filtering
            window.cityLeagueSortedData = sorted;
            
            // Group data by main Pokemon (first word)
            const groupedData = groupByMainPokemon(cityLeagueData);
            
            // Initial render
            renderFullComparisonTable(sorted.slice(0, 30));
            renderCombinedTable(groupedData.slice(0, 20));
            ensureCityLeagueSearchFilterBinding();
            // Phase 1: render meta share chart
            renderMetaChart('cityLeague', sorted);
        }



        function ensureCityLeagueSearchFilterBinding() {
            const searchInput = document.getElementById('cityLeagueSearchFilter');
            if (!searchInput) return;

            // Keep an explicit runtime hook in addition to inline HTML handlers.
            searchInput.oninput = debouncedFilterCityLeagueTable;
        }
        
        // Group archetypes by main Pokemon (first word/words before space)
        function groupByMainPokemon(data) {
            const grouped = {};
            
            data.forEach(d => {
                // Extract main Pokemon name (everything before first space or whole name)
                // Handle multi-word Pokemon like "mega lucario", "mega froslass", "alolan exeggutor"
                let mainPokemon = d.archetype.toLowerCase();
                
                // Special handling for multi-word Pokemon
                if (mainPokemon.startsWith('mega ')) {
                    const parts = mainPokemon.split(' ');
                    mainPokemon = parts.slice(0, 2).join(' '); // "mega lucario"
                } else if (mainPokemon.startsWith('alolan ') || mainPokemon.startsWith('galarian ') || mainPokemon.startsWith('hisuian ')) {
                    const parts = mainPokemon.split(' ');
                    mainPokemon = parts.slice(0, 2).join(' '); // "alolan exeggutor"
                } else {
                    mainPokemon = mainPokemon.split(' ')[0]; // First word
                }
                
                if (!grouped[mainPokemon]) {
                    grouped[mainPokemon] = {
                        main: mainPokemon,
                        new_count: 0,
                        old_count: 0,
                        new_placement_sum: 0,
                        old_placement_sum: 0,
                        variants: []
                    };
                }
                
                grouped[mainPokemon].new_count += parseInt(d.new_count || 0);
                grouped[mainPokemon].old_count += parseInt(d.old_count || 0);
                grouped[mainPokemon].new_placement_sum += parseLocaleNumber(d.new_avg_placement || '0', 0) * parseInt(d.new_count || 0);
                grouped[mainPokemon].old_placement_sum += parseLocaleNumber(d.old_avg_placement || '0', 0) * parseInt(d.old_count || 0);
                grouped[mainPokemon].variants.push(d.archetype);
            });
            
            // Calculate weighted averages and format
            const result = Object.values(grouped).map(g => {
                const new_avg = g.new_count > 0 ? (g.new_placement_sum / g.new_count).toFixed(2) : '0.00';
                const old_avg = g.old_count > 0 ? (g.old_placement_sum / g.old_count).toFixed(2) : '0.00';
                const count_change = g.new_count - g.old_count;
                const avg_change = parseFloat(new_avg) - parseFloat(old_avg);
                
                return {
                    main: g.main,
                    new_count: g.new_count,
                    old_count: g.old_count,
                    count_change: count_change,
                    new_avg_placement: new_avg,
                    old_avg_placement: old_avg,
                    avg_placement_change: avg_change.toFixed(2),
                    variant_count: g.variants.length,
                    variants: g.variants
                };
            });
            
            // Sort by new_count descending
            return result.sort((a, b) => b.new_count - a.new_count);
        }
        
        // Render Combined Table
        async function renderCombinedTable(data) {
            const container = document.getElementById('cityLeagueCombinedTable');
            if (!container) return;
            
            const isMobile = window.innerWidth <= 768;
            let tableHTML = '';
            if (isMobile) {
                // Mobile: Compact Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-mobile">
                    <colgroup>
                        <col class="city-league-info-col-main">
                        <col class="city-league-info-col-variants">
                        <col class="city-league-info-col-count">
                        <col class="city-league-info-col-placement">
                    </colgroup>
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thMainPokemon')}</th>
                            <th class="city-league-info-table-header">${t('cl.thVariants')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;

                data.forEach(d => {
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? 'var(--tint-ok-ink)' : changeValue < 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    // parseLocaleNumber: avg_placement_change traegt ein deutsches
                    // Komma (Zeile 306 schreibt es mit .replace('.', ',')).
                    // parseFloat('1,25') ergab 1 — die Aenderung wurde auf ganze
                    // Plaetze gerundet und das Vorzeichen entschied ueber die Farbe.
                    const placementChange = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const placementColor = placementChange < 0 ? 'var(--tint-ok-ink)' : placementChange > 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    /* BEFUND (Schlussabnahme 30.08.2026): stand old_count auf 0,
                       zeigte die Tabelle "14,83 (+14,83)" — die Ø-Platzierung
                       habe sich um 14,83 Plaetze verschlechtert. Es gab aber
                       keinen Vorzeitraum, gegen den sie sich haette
                       verschlechtern koennen; die Klammer wiederholte nur den
                       Wert davor mit einem Vorzeichen. Die Zahl selbst bleibt
                       stehen, die erfundene Veraenderung nicht. */
                    const _ohneBasis = (parseInt(d.old_count || 0, 10) || 0) === 0;
                    const displayName = _grossJedesWort(d.main);
                    /* BEFUND (Abnahmerunde 30.08.2026): encodeURIComponent
                       kodiert den Apostroph NICHT. Der Archetyp "N's" ergab
                       damit einen Aufrufer, der beim Klick zerbricht:

                           analyzeCombinedArchetype('n\'s', '%5B%22N's...%22%5D')
                           -> SyntaxError: missing ) after argument list

                       Gemessen: 34 von 35 Aufrufern gueltig, einer kaputt —
                       auf Schreibtisch und Mobil. js/app-tier-meta.js:879
                       macht es an derselben Stelle richtig; hier fehlte der
                       zweite Schritt. Der Wert steht in einem
                       einfach-gequoteten JS-String, also muss er auch fuer
                       JS entschaerft werden, nicht nur fuer die URL. */
                    const variantsJson = escapeJsStr(
                        encodeURIComponent(JSON.stringify(d.variants || [])));

                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-mobile" title="${d.variants.join(', ')}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-mobile" onclick="analyzeCombinedArchetype('${escapeJsStr(d.main || '')}', '${variantsJson}')" title="${t('cl.analyzeVariants')}"><span style="display:inline-flex;align-items:center;gap:6px;">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.slugIconHtml(d.main,{size:'sm'}):'')}${displayName}</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-variants-mobile">${d.variant_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-mobile">${d.new_count} ${_ohneBasis ? '' : `<span class="city-league-info-table-count-change-mobile" style="color: ${changeColor};">(${changeValue > 0 ? '+' : ''}${changeValue})</span>`}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-mobile">${_rang(d.new_avg_placement)} ${_ohneBasis ? '' : `<span class="city-league-info-table-placement-mobile" style="color: ${placementColor};">(${placementChange > 0 ? '+' : ''}${_komma(placementChange, 2)})</span>`}</td>
                        </tr>`;
                });

                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Full Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-desktop">
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thMainPokemon')}</th>
                            <th class="city-league-info-table-header">${t('cl.thVariants')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
                data.forEach(d => {
                    /* Siehe Befund weiter oben: ohne Vorzeitraum ist jede
                       Klammer nur der Wert davor mit einem Vorzeichen. */
                    const _ohneBasis = (parseInt(d.old_count || 0, 10) || 0) === 0;
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? 'var(--tint-ok-ink)' : changeValue < 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const changeText = changeValue > 0 ? `+${changeValue}` : `${changeValue}`;
                    
                    // parseLocaleNumber: avg_placement_change traegt ein deutsches
                    // Komma (Zeile 306 schreibt es mit .replace('.', ',')).
                    // parseFloat('1,25') ergab 1 — die Aenderung wurde auf ganze
                    // Plaetze gerundet und das Vorzeichen entschied ueber die Farbe.
                    const placementChange = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const placementColor = placementChange < 0 ? 'var(--tint-ok-ink)' : placementChange > 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const placementText = (placementChange > 0 ? '+' : '') + _komma(placementChange, 2);
                    
                    // Capitalize first letter
                    const displayName = _grossJedesWort(d.main);
                    /* BEFUND (Abnahmerunde 30.08.2026): encodeURIComponent
                       kodiert den Apostroph NICHT. Der Archetyp "N's" ergab
                       damit einen Aufrufer, der beim Klick zerbricht:

                           analyzeCombinedArchetype('n\'s', '%5B%22N's...%22%5D')
                           -> SyntaxError: missing ) after argument list

                       Gemessen: 34 von 35 Aufrufern gueltig, einer kaputt —
                       auf Schreibtisch und Mobil. js/app-tier-meta.js:879
                       macht es an derselben Stelle richtig; hier fehlte der
                       zweite Schritt. Der Wert steht in einem
                       einfach-gequoteten JS-String, also muss er auch fuer
                       JS entschaerft werden, nicht nur fuer die URL. */
                    const variantsJson = escapeJsStr(
                        encodeURIComponent(JSON.stringify(d.variants || [])));
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-desktop" title="${d.variants.join(', ')}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-desktop" onclick="analyzeCombinedArchetype('${escapeJsStr(d.main || '')}', '${variantsJson}')" title="${t('cl.analyzeVariants')}"><span style="display:inline-flex;align-items:center;gap:6px;">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.slugIconHtml(d.main,{size:'sm'}):'')}${displayName}</span></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-variants-desktop">${d.variant_count}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-desktop">${d.new_count} ${_ohneBasis ? '' : `<span class="city-league-info-table-count-change-desktop" style="--change-color: ${changeColor};">(${changeText})</span>`}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-desktop">${_rang(d.new_avg_placement)} ${_ohneBasis ? '' : `<span class="city-league-info-table-placement-desktop" style="--placement-color: ${placementColor};">(${placementText})</span>`}</td>
                        </tr>`;
                })
                
                tableHTML += `</tbody></table>`;
            }
            
            container.innerHTML = tableHTML;
        }
        
        // Render Full Comparison Table
        function renderFullComparisonTable(data) {
            const container = document.getElementById('cityLeagueFullTable');
            if (!container) return;
            
            const isMobile = window.innerWidth <= 768;
            let tableHTML = '';
            
            if (isMobile) {
                // Mobile: Kompakte Version
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-mobile">
                    <colgroup>
                        <col class="city-league-info-col-main">
                        <col class="city-league-info-col-count">
                        <col class="city-league-info-col-placement">
                    </colgroup>
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thDeck')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
                
                data.forEach(d => {
                    /* Siehe Befund weiter oben: ohne Vorzeitraum ist jede
                       Klammer nur der Wert davor mit einem Vorzeichen. */
                    const _ohneBasis = (parseInt(d.old_count || 0, 10) || 0) === 0;
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? 'var(--tint-ok-ink)' : changeValue < 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const placementChange = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const placementColor = placementChange < 0 ? 'var(--tint-ok-ink)' : placementChange > 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-mobile" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-mobile"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.getIconHtml(d.archetype,{size:'sm',layout:'inline'}):'')}${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-mobile">${d.new_count} ${_ohneBasis ? '' : `<span class="city-league-info-table-count-change-mobile" style="color: ${changeColor};">(${changeValue > 0 ? '+' : ''}${changeValue})</span>`}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-mobile">${_rang(d.new_avg_placement)} ${_ohneBasis ? '' : `<span class="city-league-info-table-placement-mobile" style="color: ${placementColor};">(${placementChange > 0 ? '+' : ''}${_komma(placementChange, 2)})</span>`}</td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            } else {
                // Desktop: Kompakte Version mit Aenderungen in Klammern
                tableHTML = `
                <table class="city-league-info-table city-league-info-table-desktop">
                    <thead>
                        <tr class="city-league-info-table-header-row">
                            <th class="city-league-info-table-header city-league-info-table-header-archetype">${t('cl.thArchetype')}</th>
                            <th class="city-league-info-table-header">${t('cl.thCount')}</th>
                            <th class="city-league-info-table-header">${t('cl.thAvgPlacementShort')}</th>
                        </tr>
                    </thead>
                    <tbody>`;
            
                data.forEach(d => {
                    /* Siehe Befund weiter oben: ohne Vorzeitraum ist jede
                       Klammer nur der Wert davor mit einem Vorzeichen. */
                    const _ohneBasis = (parseInt(d.old_count || 0, 10) || 0) === 0;
                    const changeValue = parseInt(d.count_change || 0);
                    const changeColor = changeValue > 0 ? 'var(--tint-ok-ink)' : changeValue < 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const changeText = changeValue > 0 ? `+${changeValue}` : `${changeValue}`;
                    
                    const placementChange = parseLocaleNumber(d.avg_placement_change || '0', 0);
                    const placementColor = placementChange < 0 ? 'var(--tint-ok-ink)' : placementChange > 0 ? 'var(--tint-bad-ink)' : 'var(--ink-3)';
                    const placementText = (placementChange > 0 ? '+' : '') + _komma(placementChange, 2);
                    const archetypeEscaped = escapeJsStr(d.archetype);
                    
                    tableHTML += `
                        <tr class="city-league-info-table-row city-league-info-table-row-desktop" title="${t('cl.goToAnalysis')} ${escapeHtml(d.archetype)}">
                            <td class="city-league-info-table-cell city-league-info-table-cell-archetype city-league-info-table-cell-main-desktop"><a href="javascript:void(0)" onclick="jumpToCardAnalysis('${archetypeEscaped}', 'cityLeague')" class="archetype-jump-link">${(typeof window.ArchetypeIcons!=='undefined'?window.ArchetypeIcons.getIconHtml(d.archetype,{size:'sm',layout:'inline'}):'')}${escapeHtml(d.archetype)}</a></td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-count-desktop">${d.new_count} ${_ohneBasis ? '' : `<span class="city-league-info-table-count-change-desktop" style="color: ${changeColor};">(${changeText})</span>`}</td>
                            <td class="city-league-info-table-cell city-league-info-table-cell-center city-league-info-table-cell-placement-desktop">${_rang(d.new_avg_placement)} ${_ohneBasis ? '' : `<span class="city-league-info-table-placement-desktop" style="color: ${placementColor};">(${placementText})</span>`}</td>
                        </tr>`;
                });
                
                tableHTML += `</tbody></table>`;
            }
            
            container.innerHTML = tableHTML;
        }
        
        // Filter City League Table
        const debouncedFilterCityLeagueTable = debounce(filterCityLeagueTable, 250);
        function filterCityLeagueTable() {
            const searchInput = document.getElementById('cityLeagueSearchFilter');
            const resultsDiv = document.getElementById('cityLeagueSearchResults');
            if (!searchInput || !window.cityLeagueSortedData) return;
            
            const searchText = searchInput.value.trim();
            
            // If empty, show top 30
            if (!searchText) {
                renderFullComparisonTable(window.cityLeagueSortedData.slice(0, 30));
                resultsDiv.textContent = '';
                return;
            }
            
            // Split by comma and trim
            const searchTerms = searchText.split(',').map(term => term.trim().toLowerCase()).filter(term => term);
            
            // Filter: show decks that contain ANY of the search terms
            const filtered = window.cityLeagueSortedData.filter(d => {
                const archetype = d.archetype.toLowerCase();
                return searchTerms.some(term => archetype.includes(term));
            });
            
            // Render filtered results
            renderFullComparisonTable(filtered);
            
            // Update results info
            if (filtered.length === 0) {
                resultsDiv.textContent = t('cl.noResults');
                resultsDiv.classList.remove('results-success');
                resultsDiv.classList.add('results-error');
            } else {
                resultsDiv.textContent = `${filtered.length} ${t('cl.resultsFound')}`;
                resultsDiv.classList.remove('results-error');
                resultsDiv.classList.add('results-success');
            }
        }

        // Explicit window bindings for deterministic E2E and inline event compatibility.
        window.filterCityLeagueTable = filterCityLeagueTable;
        window.switchCityLeagueFormat = switchCityLeagueFormat;
        
        // Load City League Analysis
        // Single owner of the big city_league_analysis*.csv fetch.
        //
        // It used to be fetched TWICE per City League load, in parallel: once
        // here into window._cityLeagueAnalysisPromise, and once inside
        // renderCityLeagueTierList, whose prefetchedAnalysisData argument is
        // null at its only call site. In the current format that is 70 KB
        // wasted; in Past Meta the file is 41.4 MB, so the tab downloaded
        // 82.8 MB to display 41.4 MB of data. The service worker serves
        // /data/ with cache: 'no-store' (deliberately, after a stale-data
        // incident), so nothing upstream deduplicated it either.
        //
        // Keyed by format: 'current' and 'past' are different files, and a
        // single unkeyed promise would hand the wrong rotation's rows to
        // whichever view asked second after a format switch.
        const _clAnalysisCache = new Map();   // format -> { p, ts }
        // Deduplicating the four fetches must not turn into "never refresh":
        // a PWA left open across a scraper run would show yesterday's rows
        // with no way back short of a reload. Ten minutes is far longer than
        // any single view's worth of re-asks and far shorter than a session.
        const CL_ANALYSIS_TTL_MS = 10 * 60 * 1000;
        function getCityLeagueAnalysisData(format, analysisUrl) {
            const key = format || 'current';
            const hit = _clAnalysisCache.get(key);
            if (hit && (Date.now() - hit.ts) < CL_ANALYSIS_TTL_MS) return hit.p;
            const url = analysisUrl || `${BASE_PATH}${key === 'past'
                ? 'city_league_analysis_past.csv' : 'city_league_analysis.csv'}`;
            const p = fetch(`${url}?t=${Date.now()}`)
                .then(r => r.ok ? r.text() : null)
                .then(text => text ? parseCSV(text) : [])
                .then(data => {
                    // Only publish as the active dataset when the user is still
                    // on the format this fetch was started for.
                    if ((window.currentCityLeagueFormat || 'current') === key) {
                        window.cityLeagueAnalysisData = data;
                    }
                    devLog(`Analysis data loaded for ${key}: ${data.length} rows`);
                    return data;
                })
                .catch(err => {
                    console.error('Analysis CSV load failed:', err);
                    // Do not cache a failure — the next view should retry.
                    _clAnalysisCache.delete(key);
                    return [];
                });
            _clAnalysisCache.set(key, { p, ts: Date.now() });
            return p;
        }
        window.getCityLeagueAnalysisData = getCityLeagueAnalysisData;
        // Explicit escape hatch for a manual refresh affordance.
        window.invalidateCityLeagueAnalysisCache = () => _clAnalysisCache.clear();

        async function loadCityLeagueAnalysis() {
            devLog('Loading City League Analysis...');

            const format = window.currentCityLeagueFormat || 'current';
            const isPast = format === 'past';
            const timestamp = new Date().getTime();
            const analysisUrl   = `${BASE_PATH}${isPast ? 'city_league_analysis_past.csv'              : 'city_league_analysis.csv'}`;
            const archetypesUrl = `${BASE_PATH}${isPast ? 'city_league_archetypes_past.csv'            : 'city_league_archetypes.csv'}`;
            const comparisonUrl = `${BASE_PATH}${isPast ? 'city_league_archetypes_past_comparison.csv' : 'city_league_archetypes_comparison.csv'}`;
            const hasComparisonFile = true;
            
            devLog(`Loading City League Analysis for format: ${format}`);

            // Analysis-CSV kann bereits im Hintergrund geladen worden sein
            let data = null;
            if (window._cityLeagueAnalysisPromise) {
                data = await window._cityLeagueAnalysisPromise;
                if (data && data.length > 0) {
                    devLog('Reusing background-loaded analysis data:', data.length, 'rows');
                } else {
                    data = null;
                }
            }

            const [analysisText, archetypesText, comparisonText] = await Promise.all([
                // Nur fetchen wenn Background-Load noch nicht fertig
                !data
                    ? fetch(`${analysisUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.error(`Error loading analysis CSV (${analysisUrl}):`, error);
                            return null;
                        })
                    : Promise.resolve('__SKIP__'),
                fetch(`${archetypesUrl}?t=${timestamp}`)
                    .then(response => response.ok ? response.text() : null)
                    .catch(error => {
                        console.error(`Error loading archetypes CSV (${archetypesUrl}):`, error);
                        return null;
                    }),
                hasComparisonFile
                    ? fetch(`${comparisonUrl}?t=${timestamp}`)
                        .then(response => response.ok ? response.text() : null)
                        .catch(error => {
                            console.warn(`Ignoring missing comparison CSV (${comparisonUrl}):`, error);
                            return null;
                        })
                    : Promise.resolve(null)
            ]);

            if (!data) {
                data = analysisText ? await fetchAndParseCSV(analysisUrl) : null;
            }
            const archetypesData = archetypesText ? await fetchAndParseCSV(archetypesUrl) : null;
            _captureKnownCityLeagueTournamentIds(archetypesData);
            const comparisonData = comparisonText ? await fetchAndParseCSV(comparisonUrl) : deriveCityLeagueComparisonData(archetypesData || []);

            devLog('Loaded data:', data ? `${data.length} rows` : 'null');
            devLog('Loaded archetypes data:', archetypesData ? `${archetypesData.length} rows` : 'null');
            devLog('Loaded comparison data:', comparisonData ? `${comparisonData.length} rows` : 'null');

            if (data && data.length > 0 && archetypesData && archetypesData.length > 0) {
                devLog('Processing archetypes...');
                window.cityLeagueAnalysisData = data;
                window.cityLeagueArchetypesData = archetypesData;
                window.cityLeagueComparisonData = comparisonData;
                _updateCityLeagueDateRangeHints(data);
                const previousDeckValue = document.getElementById('cityLeagueDeckSelect')?.value || '';
                populateCityLeagueDeckSelect(data, comparisonData);
                const deckSelect = document.getElementById('cityLeagueDeckSelect');
                // Respect value already set by populateCityLeagueDeckSelect (pending selection)
                const currentValue = deckSelect ? deckSelect.value : '';
                let restoredAnalysisDeck = currentValue;
                if (!currentValue && deckSelect && previousDeckValue) {
                    const stillExists = Array.from(deckSelect.options).some(option => option.value === previousDeckValue);
                    if (stillExists) {
                        deckSelect.value = previousDeckValue;
                        restoredAnalysisDeck = previousDeckValue;
                        syncSearchableSelectDisplay(deckSelect);
                    }
                }
                // Reload analysis for restored deck with fresh data
                if (restoredAnalysisDeck) {
                    loadCityLeagueDeckData(restoredAnalysisDeck);
                }
                window.cityLeagueAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                devLog('Loading meta card analysis for consistency...');
                loadMetaCardAnalysis('cityLeague');
            } else {
                const tableContainer = document.getElementById('cityLeagueAnalysisTable');
                if (tableContainer) {
                    const errorMsg = 'Error loading City League Analysis data';
                    console.error(errorMsg, { format, hasAnalysis: !!data, hasArchetypes: !!archetypesData });
                    tableContainer.innerHTML = cityLeagueOffSeasonHtml(format === 'past');
                }
            }
        }
        
        function populateCityLeagueDeckSelect(data, comparisonData) {
            // Always use FULL (unfiltered) archetype data for deck counts in the
            // dropdown so the number reflects the total meta regardless of date filter.
            // The date-specific "Used Decks" count is shown separately in Deck Stats.
            const allArchetypesData = window.cityLeagueArchetypesData || [];

            const archetypeCountMap = new Map();
            allArchetypesData.forEach(row => {
                const archetypeName = String(row.archetype || '').trim();
                if (!archetypeName) return;

                const key = archetypeName.toLowerCase();
                archetypeCountMap.set(key, (archetypeCountMap.get(key) || 0) + 1);
            });

            // Create a map of archetype names to their current deck counts from comparison data
            const comparisonMap = new Map();
            if (comparisonData && comparisonData.length > 0) {
                comparisonData.forEach(row => {
                    if (row.archetype && row.new_count) {
                        comparisonMap.set(row.archetype.toLowerCase(), parseInt(row.new_count || 0));
                    }
                });
                devLog('Loaded comparison counts for', comparisonMap.size, 'archetypes');
            }
            
            // Extract unique archetypes with their deck counts (total meta counts)
            const archetypeMap = new Map();
            // `data` ist optional: der languageChanged-Handler unten ruft
            // populateCityLeagueDeckSelect() ohne Argumente. Solange die
            // City League Daten hat, faengt allArchetypesData das ab —
            // waehrend der Saisonpause ist die Liste leer, sourceRows wurde
            // `undefined`, und jeder Sprachwechsel warf eine TypeError in
            // die Konsole. Gemessen am 18.08.2026, mit leerem JP-Datenraum.
            const sourceRows = (allArchetypesData.length > 0 ? allArchetypesData : data) || [];
            sourceRows.forEach(row => {
                if (row.archetype && !archetypeMap.has(row.archetype)) {
                    // Use total meta counts so dropdown always shows full picture.
                    const deckCount = archetypeCountMap.get(row.archetype.toLowerCase())
                        || comparisonMap.get(row.archetype.toLowerCase())
                        || parseInt(row.total_decks_in_archetype || 0, 10)
                        || 0;
                    archetypeMap.set(row.archetype, {
                        name: row.archetype,
                        deckCount: deckCount
                    });
                }
            });
            
            const archetypeList = Array.from(archetypeMap.values());
            devLog('Found archetypes:', archetypeList.length);
            
            // Sort by deck count descending to get top meta decks
            const sortedByMeta = [...archetypeList].sort((a, b) => b.deckCount - a.deckCount);
            const top10 = sortedByMeta.slice(0, 10);
            const rest = sortedByMeta.slice(10).sort((a, b) => a.name.localeCompare(b.name));
            
            devLog('Top 10 meta decks:', top10.map(d => `${d.name} (${d.deckCount})`));
            
            const select = document.getElementById('cityLeagueDeckSelect');
            if (!select) return;
            
            // Clear and repopulate
            select.innerHTML = '<option value="">' + t('cl.selectDeck') + '</option>';
            
            // Add top 10 meta decks
            if (top10.length > 0) {
                const topGroup = document.createElement('optgroup');
                topGroup.label = t('cl.topMetaDecks');
                top10.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} ${t(archetype.deckCount === 1 ? 'cl.deckSingular' : 'cl.decks')})`;
                    topGroup.appendChild(option);
                });
                select.appendChild(topGroup);
            }
            
            // Add remaining decks alphabetically
            if (rest.length > 0) {
                const restGroup = document.createElement('optgroup');
                restGroup.label = t('cl.allOtherDecks');
                rest.forEach(archetype => {
                    const option = document.createElement('option');
                    option.value = archetype.name;
                    option.textContent = `${archetype.name} (${archetype.deckCount} ${t(archetype.deckCount === 1 ? 'cl.deckSingular' : 'cl.decks')})`;
                    restGroup.appendChild(option);
                });
                select.appendChild(restGroup);
            }
            

            // Add combined (multi-variant) archetypes at end of alphabet
            const combinedGroupMap = {};
            archetypeList.forEach(archetype => {
                let main = archetype.name.toLowerCase();
                if (main.startsWith('mega ') || main.startsWith('alolan ') || main.startsWith('galarian ') || main.startsWith('hisuian ')) {
                    main = main.split(' ').slice(0, 2).join(' ');
                } else {
                    main = main.split(' ')[0];
                }
                if (!combinedGroupMap[main]) combinedGroupMap[main] = { main, totalDecks: 0, variants: [] };
                combinedGroupMap[main].totalDecks += archetype.deckCount;
                combinedGroupMap[main].variants.push(archetype.name);
            });
            const combinedGroups = Object.values(combinedGroupMap)
                .filter(g => g.variants.length >= 2)
                .sort((a, b) => a.main.localeCompare(b.main));
            if (combinedGroups.length > 0) {
                const combinedOptGroup = document.createElement('optgroup');
                combinedOptGroup.label = t('cl.combinedArchetypes');
                combinedGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = 'GROUP:' + g.variants.join('|');
                    opt.textContent = `${_grossJedesWort(g.main)} — ${t('cl.allVariants')} (${g.totalDecks} ${t(g.totalDecks === 1 ? 'cl.deckSingular' : 'cl.decks')})`;
                    combinedOptGroup.appendChild(opt);
                });
                select.appendChild(combinedOptGroup);
            }

            // Add change event listener (for programmatic changes)
            select.onchange = function() {
                if (this.value) {
                    loadCityLeagueDeckData(this.value);
                    devLog('[Dropdown] Archetype selected:', this.value);
                } else {
                    clearCityLeagueDeckView();
                }
            };

            // If navigation requested a specific deck while data was loading, apply it now.
            const pendingDeck = String(window.pendingCityLeagueDeckSelection || '').trim();
            if (pendingDeck) {
                const matchingOption = Array.from(select.options).find(option =>
                    option.value && option.value.toLowerCase() === pendingDeck.toLowerCase()
                );
                if (matchingOption) {
                    select.value = matchingOption.value;
                    // Sync the custom searchable dropdown's display label
                    // — same gap that bit #current-analysis deep-links
                    // (F-09 from the visual sweep).
                    if (typeof syncSearchableSelectDisplay === 'function') {
                        try { syncSearchableSelectDisplay(select); } catch (_e) { /* tolerate */ }
                    }
                    window.pendingCityLeagueDeckSelection = null;
                    loadCityLeagueDeckData(matchingOption.value);
                    devLog('[OK] Applied pending City League deck selection:', matchingOption.value);
                }
            }

            // Apply pending combined archetype selection (from analyzeCombinedArchetype click)
            applyPendingCombinedArchetypeSelection();

            // Convert native <select> to a custom searchable dropdown
            initSearchableSelect(select);
        }

        /**
         * Converts a native <select> into a custom searchable dropdown.
         * The <select> stays hidden for data / programmatic access.
         * A visual overlay with a built-in search input replaces it.
         */
        function initSearchableSelect(selectEl) {
            if (!selectEl) return;
            // Defensive: bail out cleanly if the select has been detached
            // from the DOM (race condition between data reload + tab switch).
            if (!selectEl.parentElement) {
                console.warn('[initSearchableSelect] no parentElement on', selectEl.id);
                return;
            }
            try {
                _initSearchableSelectImpl(selectEl);
            } catch (err) {
                console.error('[initSearchableSelect] failed for', selectEl.id, err);
                // Last-resort fallback: at least hide the native select so
                // iOS doesn't open its own picker on top of nothing.
                selectEl.style.cssText += ';display:none !important;';
            }
        }
        function _initSearchableSelectImpl(selectEl) {
            // Remove previous instance if populateCityLeagueDeckSelect is called again
            const prev = selectEl.parentElement.querySelector('.searchable-select');
            if (prev) prev.remove();

            // Force display:none with !important — a plain `display:none`
            // on the inline style can be overridden by mobile-responsive
            // rules that target `#past-meta select.control-input` etc.,
            // which would let iOS open its native picker on top of the
            // custom dropdown.
            selectEl.style.cssText += ';display:none !important;';

            // --- Wrapper ---
            const wrapper = document.createElement('div');
            wrapper.className = 'searchable-select';

            // --- Display (shows current selection) ---
            const display = document.createElement('div');
            display.className = 'searchable-select-display control-input modern-select';
            display.tabIndex = 0;
            display.textContent = selectEl.options[selectEl.selectedIndex]?.textContent || t('cl.selectDeck');

            // --- Dropdown panel ---
            const dropdown = document.createElement('div');
            dropdown.className = 'searchable-select-dropdown';

            const search = document.createElement('input');
            search.type = 'text';
            search.className = 'searchable-select-search';
            search.placeholder = t('filter.searchDeckPlaceholder') || 'Search deck…';
            search.autocomplete = 'off';
            search.setAttribute('aria-label', t('filter.searchDeckPlaceholder') || 'Search deck');

            const list = document.createElement('div');
            list.className = 'searchable-select-options';

            dropdown.appendChild(search);
            dropdown.appendChild(list);

            // --- Build visible option items from <select> ---
            function buildList(filter) {
                list.innerHTML = '';
                const q = (filter || '').toLowerCase().trim();

                // Default "-- Select a Deck --"
                if (!q) {
                    const def = document.createElement('div');
                    def.className = 'searchable-select-option' + (!selectEl.value ? ' selected' : '');
                    def.textContent = selectEl.options[0]?.textContent || '-- Select a Deck --';
                    def.dataset.value = '';
                    def.onclick = () => pick('', def.textContent);
                    list.appendChild(def);
                }

                // Grouped options (<optgroup>)
                Array.from(selectEl.querySelectorAll('optgroup')).forEach(group => {
                    const opts = Array.from(group.querySelectorAll('option')).filter(o =>
                        !q || o.textContent.toLowerCase().includes(q)
                    );
                    if (opts.length === 0) return;

                    const label = document.createElement('div');
                    label.className = 'searchable-select-group';
                    label.textContent = group.label;
                    list.appendChild(label);

                    opts.forEach(o => {
                        const item = document.createElement('div');
                        item.className = 'searchable-select-option' + (o.value === selectEl.value ? ' selected' : '');
                        item.textContent = o.textContent;
                        item.dataset.value = o.value;
                        item.onclick = () => pick(o.value, o.textContent);
                        list.appendChild(item);
                    });
                });

                // Standalone options (not inside <optgroup>)
                Array.from(selectEl.children).forEach(child => {
                    if (child.tagName !== 'OPTION' || child === selectEl.options[0]) return;
                    if (q && !child.textContent.toLowerCase().includes(q)) return;
                    const item = document.createElement('div');
                    item.className = 'searchable-select-option' + (child.value === selectEl.value ? ' selected' : '');
                    item.textContent = child.textContent;
                    item.dataset.value = child.value;
                    item.onclick = () => pick(child.value, child.textContent);
                    list.appendChild(item);
                });
            }

            function pick(value, text) {
                selectEl.value = value;
                display.textContent = text;
                close();
                // Trigger the existing change handler on the hidden <select>.
                // _syncSuppressed flips the global change-listener (registered
                // at the bottom of _initSearchableSelectImpl) into a no-op
                // for this dispatch — we already set display.textContent
                // above to the exact source-of-truth `text`, so re-syncing
                // would just be a redundant lookup.
                selectEl._syncSuppressed = true;
                try { selectEl.dispatchEvent(new Event('change', { bubbles: true })); }
                finally { selectEl._syncSuppressed = false; }
            }

            // Position the dropdown using getBoundingClientRect — required
            // because the dropdown is position:fixed (sits above every
            // overflow:hidden ancestor). Width clamps to a minimum of
            // 280px so a narrow trigger doesn't cut off the search input
            // or the archetype names; if the resulting width would push
            // the dropdown off-screen, slide left until it fits.
            function positionDropdown() {
                const rect = display.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth || 0;
                const minWidth = 280;
                const maxWidth = Math.max(minWidth, vw - 12);
                const desiredWidth = Math.max(rect.width, minWidth);
                const width = Math.min(desiredWidth, maxWidth);
                let left = rect.left;
                if (left + width > vw - 6) left = Math.max(6, vw - width - 6);
                if (left < 6) left = 6;
                dropdown.style.top = rect.bottom + 'px';
                dropdown.style.left = left + 'px';
                dropdown.style.width = width + 'px';
            }

            // Page scroll/resize → re-anchor under the trigger. Crucially
            // we DO NOT use {capture:true} so this handler doesn't fire
            // for scroll events inside the dropdown's own option list —
            // that's why the previous close-on-scroll variant slammed
            // shut the moment the user touched the dropdown on mobile.
            function onScrollReposition() {
                if (!isOpen()) return;
                positionDropdown();
            }

            function open() {
                positionDropdown();
                dropdown.classList.add('open');
                search.value = '';
                buildList('');
                search.focus({ preventScroll: true });
                window.addEventListener('scroll', onScrollReposition, { passive: true });
                window.addEventListener('resize', onScrollReposition, { passive: true });
            }

            function close() {
                dropdown.classList.remove('open');
                window.removeEventListener('scroll', onScrollReposition);
                window.removeEventListener('resize', onScrollReposition);
            }

            function isOpen() {
                return dropdown.classList.contains('open');
            }

            display.onclick = (e) => {
                e.stopPropagation();
                isOpen() ? close() : open();
            };

            search.oninput = () => buildList(search.value);
            search.onclick = (e) => e.stopPropagation();

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!wrapper.contains(e.target)) close();
            });

            // Keyboard: Escape closes
            search.onkeydown = (e) => {
                if (e.key === 'Escape') close();
            };

            wrapper.appendChild(display);
            wrapper.appendChild(dropdown);
            selectEl.parentElement.insertBefore(wrapper, selectEl.nextSibling);

            // Keep display text in sync when select.value changes programmatically
            selectEl._searchableDisplay = display;

            // 2026-06-11 Chrome-plugin regression report flagged a
            // label-desync bug: when select.value is set externally
            // (deep-link restoration, JS calling `select.value =`,
            // language switch re-rendering options) the label stayed
            // on the previously-picked archetype until the user
            // manually opened the dropdown. The codebase has 30+
            // call sites of `syncSearchableSelectDisplay()` patching
            // this case-by-case — easy to miss one. Centralise here
            // by listening on the hidden <select>'s `change` event:
            // any dispatchEvent('change') (whether from our pick()
            // below, an external programmatic update, or a browser
            // form-reset) re-renders the display label. A
            // _syncSuppressed guard prevents loops with the internal
            // pick() path which already sets the label directly.
            selectEl.addEventListener('change', () => {
                if (selectEl._syncSuppressed) return;
                const opt = selectEl.options[selectEl.selectedIndex];
                display.textContent = opt
                    ? opt.textContent
                    : (selectEl.options[0]?.textContent || t('cl.selectDeck'));
            });

            // 2026-06-11 Chrome-plugin regression: the placeholder option
            // (e.g. "-- Select a Deck --") was first populated with the
            // language that was active when the tab was opened. After a
            // later EN↔DE toggle, the <option>'s textContent got updated
            // by updateTranslationsInDOM (now that we tag the option with
            // data-i18n), but the searchable-select's visible label +
            // search-input placeholder still showed the stale string
            // because they don't re-read the underlying <option>. Mirror
            // the language switch into both surfaces here.
            const onLangChange = () => {
                const opt = selectEl.options[selectEl.selectedIndex];
                const fallback = selectEl.options[0]?.textContent || t('cl.selectDeck');
                display.textContent = opt ? opt.textContent : fallback;
                const searchPh = t('filter.searchDeckPlaceholder') || 'Search deck…';
                search.placeholder = searchPh;
                search.setAttribute('aria-label', searchPh);
                if (isOpen()) buildList(search.value);
            };
            document.addEventListener('languageChanged', onLangChange);
        }

        // Helper: update searchable select display when value set externally
        function syncSearchableSelectDisplay(selectEl) {
            if (!selectEl) return;
            var doSync = function() {
                var displayEl = selectEl._searchableDisplay
                    || (selectEl.parentElement && selectEl.parentElement.querySelector('.searchable-select-display'));
                if (displayEl) {
                    var opt = selectEl.options[selectEl.selectedIndex];
                    displayEl.textContent = opt ? opt.textContent : '';
                    selectEl._searchableDisplay = displayEl;
                }
            };
            doSync();
            // Retry once after a tick in case initSearchableSelect hasn't run yet
            setTimeout(doSync, 50);
        }
        
        // Date filter functions for City League
        function getFilteredCityLeagueArchetypesData() {
            const archetypesData = window.cityLeagueArchetypesData || [];
            if (!window.cityLeagueDateFilterActive) {
                return archetypesData;
            }

            const dateFrom = window.cityLeagueDateFrom || '1900-01-01';
            const dateTo = window.cityLeagueDateTo || '2099-12-31';

            return archetypesData.filter(row => {
                const rawDate = row.date || row.tournament_date || '';
                const parsedDate = parseJapaneseDate(rawDate);
                return parsedDate ? parsedDate >= dateFrom && parsedDate <= dateTo : false;
            });
        }

        function getCityLeagueArchetypeStats(archetype) {
            const selection = parseArchetypeSelection(archetype);
            const targetsLower = selection.targetArchetypes.map(v => v.toLowerCase());

            const matches = getFilteredCityLeagueArchetypesData().filter(row => {
                const rowArch = String(row.archetype || '').trim().toLowerCase();
                return rowArch && targetsLower.includes(rowArch);
            });

            const decksCount = matches.length;
            // Dieselbe Sache noch einmal, und hier schlimmer: `row.placement
            // || 0` machte aus einem leeren Feld eine NULL, die als
            // Platzierung in den Zähler einging. Eine fehlende Platzierung
            // ist kein Platz 0 — sie ist keine Platzierung. Gezählt wird
            // jetzt nur, was auch summiert wird.
            const platzierungen = matches
                .map(row => parseInt(row.placement, 10))
                .filter(p => Number.isFinite(p) && p > 0);
            const avgPlacement = platzierungen.length > 0
                ? (platzierungen.reduce((sum, p) => sum + p, 0) / platzierungen.length).toFixed(2)
                : '-';

            return {
                rows: matches,
                decksCount,
                avgPlacement
            };
        }

        function getSelectedCityLeagueDeckCount(archetype) {
            const selectEl = document.getElementById('cityLeagueDeckSelect');
            if (!selectEl || !archetype) return 0;

            const option = Array.from(selectEl.options).find(o => o.value === archetype);
            const label = option ? option.textContent : '';
            const match = label ? label.match(/\((\d+)\s+Decks\)/i) : null;
            return match ? parseInt(match[1], 10) || 0 : 0;
        }

        function applyPendingCombinedArchetypeSelection() {
            const pending = window.pendingCombinedArchetypeSelection;
            if (!pending) return;
            const select = document.getElementById('cityLeagueDeckSelect');
            if (!select || select.options.length <= 1) return;
            window.pendingCombinedArchetypeSelection = null;
            // Option should exist in the combined optgroup; add a temporary one if not
            let option = Array.from(select.options).find(opt => opt.value === pending.value);
            if (!option) {
                option = document.createElement('option');
                option.value = pending.value;
                option.textContent = pending.label;
                select.appendChild(option);
            }
            select.value = pending.value;
            syncSearchableSelectDisplay(select);
            loadCityLeagueDeckData(pending.value);
            devLog('[OK] Applied combined archetype:', pending.value.replace('GROUP:', '').split('|')[0]);
        }

        function refreshCityLeagueDeckSelect() {
            const select = document.getElementById('cityLeagueDeckSelect');
            const previousValue = select ? select.value : '';

            populateCityLeagueDeckSelect(window.cityLeagueAnalysisData || [], window.cityLeagueComparisonData || []);

            if (!select) return '';

            const currentValue = select.value; // populateCityLeagueDeckSelect may have applied pending
            if (currentValue) {
                syncSearchableSelectDisplay(select);
                return currentValue;
            }

            const stillExists = Array.from(select.options).some(option => option.value === previousValue);
            if (stillExists && previousValue) {
                select.value = previousValue;
                syncSearchableSelectDisplay(select);
            } else {
                select.value = '';
            }
            return select.value;
        }

        // Zuletzt ermittelte Datumsspanne der geladenen Zeilen, roh und
        // ohne Beschriftung (siehe _updateCityLeagueDateRangeHints).
        let _clDatumsSpanneText = '';

        // Beschriftet die beiden "Verfuegbar: ..."-Hinweise neu, ohne die
        // Datenzeilen erneut zu lesen. Wird vom Sprachwechsel gerufen.
        function _relabelCityLeagueDateRangeHints() {
            if (!_clDatumsSpanneText) return;
            const label = (typeof t === 'function' ? t('filter.availableRange') : 'Available')
                + `: ${_clDatumsSpanneText}`;
            document.querySelectorAll('.cl-date-range-hint')
                .forEach(el => { el.textContent = label; });
        }

        // Update the From/To date inputs with min+max attributes derived
        // from the loaded data, plus a "Available: …" hint below each
        // input so the user knows what range is on file before picking.
        // Without this, the empty inputs gave no signal of whether the
        // dataset is full or whether a date is required.
        function _updateCityLeagueDateRangeHints(rows) {
            const fromEl = document.getElementById('cityLeagueDateFrom');
            const toEl   = document.getElementById('cityLeagueDateTo');
            if (!fromEl || !toEl || !Array.isArray(rows) || rows.length === 0) return;
            // Collect ISO-like dates from `tournament_date` or `date` cols.
            let minISO = null, maxISO = null;
            for (const r of rows) {
                const raw = String(r.tournament_date || r.date || '').trim();
                let iso = '';
                if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
                    iso = raw.slice(0, 10);
                } else if (typeof parseJapaneseDate === 'function') {
                    // parseJapaneseDate returns an ISO-format STRING
                    // ("2026-04-29"), not a Date object — calling
                    // .toISOString() on it threw TypeError once the
                    // analysis CSV started carrying English ordinal
                    // dates ("29th April 2026") that fall through to
                    // this branch. Use the returned string directly.
                    const isoStr = parseJapaneseDate(raw);
                    if (isoStr) iso = isoStr.slice(0, 10);
                }
                if (!iso) continue;
                if (!minISO || iso < minISO) minISO = iso;
                if (!maxISO || iso > maxISO) maxISO = iso;
            }
            if (!minISO || !maxISO) return;
            fromEl.min = minISO; fromEl.max = maxISO;
            toEl.min   = minISO; toEl.max   = maxISO;
            // Render a "Available: …" hint underneath each input. Re-uses
            // a single element id so we don't accumulate duplicates on
            // subsequent reloads.
            const fmt = iso => {
                const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
                return m ? `${parseInt(m[3], 10)}.${parseInt(m[2], 10)}.${m[1]}` : iso;
            };
            const rangeText = `${fmt(minISO)} – ${fmt(maxISO)}`;
            // Befund A4 (30.08.2026): die beiden Hinweise wurden einmal
            // gesetzt und danach nie wieder angefasst. FOLGE: nach dem
            // Umschalten von Deutsch auf Englisch stand unter beiden
            // Datumsfeldern weiter "Verfuegbar: 6.6.2026 - 6.6.2026"
            // (2 von 4 gemessenen veralteten Zeilen dieses Reiters).
            // Die Spanne selbst ist sprachunabhaengig — sie wird hier
            // gemerkt, damit der Sprachwechsel unten nur noch das Wort
            // davor tauschen muss und nicht erneut alle Zeilen liest.
            _clDatumsSpanneText = rangeText;
            const ensureHint = (input, text) => {
                let hint = input.nextElementSibling;
                if (!hint || !hint.classList || !hint.classList.contains('cl-date-range-hint')) {
                    hint = document.createElement('div');
                    hint.className = 'cl-date-range-hint';
                    input.insertAdjacentElement('afterend', hint);
                }
                hint.textContent = text;
            };
            const hintLabel = (typeof t === 'function' ? t('filter.availableRange') : 'Available') + `: ${rangeText}`;
            ensureHint(fromEl, hintLabel);
            ensureHint(toEl,   hintLabel);
        }

        function resetCityLeagueDateFilter() {
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            
            if (dateFromEl) dateFromEl.value = '';
            if (dateToEl) dateToEl.value = '';
            
            window.cityLeagueDateFilterActive = false;
            updateCityLeagueDateFilterStatus();
            
            const selectedArchetype = refreshCityLeagueDeckSelect();
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
            } else {
                clearCityLeagueDeckView();
            }
        }
        
        function applyCityLeagueDateFilter() {
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            const dateFrom = dateFromEl ? dateFromEl.value : '';
            const dateTo = dateToEl ? dateToEl.value : '';
            
            // Set filter active if at least one date is set
            if (dateFrom || dateTo) {
                window.cityLeagueDateFilterActive = true;
                window.cityLeagueDateFrom = dateFrom || '1900-01-01';
                window.cityLeagueDateTo = dateTo || '2099-12-31';
            } else {
                // If both dates are cleared, disable filter
                window.cityLeagueDateFilterActive = false;
            }
            
            updateCityLeagueDateFilterStatus();
            
            const selectedArchetype = refreshCityLeagueDeckSelect();
            if (selectedArchetype) {
                loadCityLeagueDeckData(selectedArchetype);
            } else {
                clearCityLeagueDeckView();
            }
        }
        
        function updateCityLeagueDateFilterStatus() {
            const statusEl = document.getElementById('cityLeagueDateFilterStatus');
            if (!statusEl) return;
            
            const dateFromEl = document.getElementById('cityLeagueDateFrom');
            const dateToEl = document.getElementById('cityLeagueDateTo');
            const dateFrom = dateFromEl ? dateFromEl.value : '';
            const dateTo = dateToEl ? dateToEl.value : '';
            
            if (dateFrom && dateTo) {
                statusEl.textContent = `${t('cl.filteredRange')} ${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else if (dateFrom) {
                statusEl.textContent = `${t('cl.filteredFrom')} ${formatDate(dateFrom)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else if (dateTo) {
                statusEl.textContent = `${t('cl.filteredUntil')} ${formatDate(dateTo)}`;
                statusEl.className = 'city-league-status city-league-status-active';
            } else {
                statusEl.textContent = t('cl.showingAll');
                statusEl.className = 'city-league-status city-league-status-inactive';
            }
        }
        
        function formatDate(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr + 'T00:00:00');
            const day = date.getDate();
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            return `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
        }
        
        function getCityLeagueDeckCountFallback(archetype) {
            if (!archetype) return 0;

            const selection = parseArchetypeSelection(archetype);
            const targetsLower = selection.targetArchetypes.map(v => v.toLowerCase());

            const liveStats = getCityLeagueArchetypeStats(archetype);
            if (liveStats.decksCount > 0) return liveStats.decksCount;

            // 1) Prefer comparison dataset (new_count)
            const comparisonRows = window.cityLeagueComparisonData || [];
            const comparisonCount = comparisonRows
                .filter(row => row.archetype && targetsLower.includes(String(row.archetype).toLowerCase()))
                .reduce((sum, row) => sum + (parseInt(row.new_count || row.count || row.total_decks_in_archetype || 0, 10) || 0), 0);
            if (comparisonCount > 0) return comparisonCount;

            // 2) Fallback to selected dropdown label: "Archetype (43 Decks)"
            const selectEl = document.getElementById('cityLeagueDeckSelect');
            if (selectEl) {
                const option = Array.from(selectEl.options).find(o => o.value === archetype);
                const label = option ? option.textContent : '';
                const match = label ? label.match(/\((\d+)\s+Decks\)/i) : null;
                if (match) {
                    const parsed = parseInt(match[1], 10);
                    if (parsed > 0) return parsed;
                }
            }

            // 3) Last fallback from analysis rows
            const analysisRows = window.cityLeagueAnalysisData || [];
            const analysisCount = analysisRows
                .filter(row => row.archetype && targetsLower.includes(String(row.archetype).toLowerCase()))
                .reduce((max, row) => Math.max(max, parseInt(row.total_decks_in_archetype || 0, 10) || 0), 0);
            return analysisCount > 0 ? analysisCount : 0;
        }

        // Parse tournament dates to YYYY-MM-DD (supports multiple formats)
        function parseJapaneseDate(dateStr) {
            if (!dateStr || dateStr.trim() === '') return '';

            const raw = dateStr.trim();

            // Already ISO-like
            const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (isoMatch) return raw;

            // German/European numeric format: dd.mm.yyyy or dd.mm.yy
            const dotMatch = raw.match(/^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/);
            if (dotMatch) {
                const day = dotMatch[1].padStart(2, '0');
                const month = dotMatch[2].padStart(2, '0');
                const yearRaw = dotMatch[3];
                const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
                return `${year}-${month}-${day}`;
            }

            // Normalize ordinal suffixes: 14th -> 14
            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const parts = cleaned.split(/[.\s]+/).filter(Boolean);
            if (parts.length < 3) return '';

            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toLowerCase();
            const yearRaw = parts[2];
            const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

            const monthMap = {
                jan: '01', january: '01', januar: '01',
                feb: '02', february: '02', februar: '02',
                mar: '03', march: '03', maerz: '03', märz: '03',
                apr: '04', april: '04',
                may: '05', mai: '05',
                jun: '06', june: '06', juni: '06',
                jul: '07', july: '07', juli: '07',
                aug: '08', august: '08',
                sep: '09', sept: '09', september: '09',
                oct: '10', october: '10', oktober: '10',
                nov: '11', november: '11',
                dec: '12', december: '12', dezember: '12'
            };

            const month = monthMap[monthStr];
            if (!month) return '';
            return `${year}-${month}-${day}`;
        }

        // ─────────────────────────────────────────────────────────────────────
        // Bug 2026-04: the analysis CSV is week-aggregated and frequently
        // includes tournament_ids that are NOT yet present in the archetypes
        // CSV (the archetypes file is built from a separate scrape that lags
        // by ~1 week). The card-stat display then computed M (numerator)
        // from analysis rows and B (denominator) from archetypes-only deck
        // counts — producing nonsense like 670/645 (= 100,1 %) for popular
        // archetypes.
        //
        // Fix: capture the set of known tournament_ids when the archetypes
        // CSV is parsed, and filter analysis rows down to that set in both
        // aggregation paths so M and B share the same data basis.
        // _filterCardRowsToKnownTournaments is a no-op if the set hasn't
        // been captured yet (e.g. on the first render before archetypes
        // finished parsing), preserving prior behaviour as a safety net.
        // ─────────────────────────────────────────────────────────────────────
        function _captureKnownCityLeagueTournamentIds(archetypesData) {
            if (!Array.isArray(archetypesData)) return;
            const ids = new Set();
            archetypesData.forEach(row => {
                if (!row) return;
                const tid = row.tournament_id;
                if (tid !== undefined && tid !== null && tid !== '') {
                    ids.add(String(tid));
                }
            });
            window.knownCityLeagueTournamentIds = ids;
            devLog(`Captured ${ids.size} known City-League tournament IDs from archetypes CSV`);
        }
        function _filterCardRowsToKnownTournaments(rows) {
            const known = window.knownCityLeagueTournamentIds;
            if (!known || known.size === 0) return rows; // not ready yet → no-op
            const filtered = rows.filter(row => {
                const tid = row && row.tournament_id;
                // Rows without a tournament_id stay (already-aggregated CSVs
                // emit such rows; dropping them would break legacy data).
                if (tid === undefined || tid === null || tid === '') return true;
                return known.has(String(tid));
            });
            const dropped = rows.length - filtered.length;
            if (dropped > 0) {
                devLog(`Dropped ${dropped}/${rows.length} analysis rows from tournaments not yet in archetypes CSV`);
            }
            return filtered;
        }

        // Recalculate card statistics based on filtered tournament data
        function recalculateCardStatsForFilteredData(filteredCards, archetype) {
            // Drop rows whose tournament hasn't landed in archetypes yet so M
            // and B (denominator from archetypes) share the same data basis.
            filteredCards = _filterCardRowsToKnownTournaments(filteredCards);
            // Count unique tournaments/decks in filtered data
            const uniqueTournamentIds = new Set();
            filteredCards.forEach(card => {
                if (card.tournament_id) {
                    uniqueTournamentIds.add(card.tournament_id);
                }
            });
            const totalDecks = uniqueTournamentIds.size;
            
            // Group cards by card_name and recalculate stats
            const cardStatsMap = new Map();
            
            filteredCards.forEach(row => {
                const cardName = row.card_name;
                if (!cardStatsMap.has(cardName)) {
                    cardStatsMap.set(cardName, {
                        tournaments: new Set(),
                        counts: [],
                        sampleRow: row
                    });
                }
                
                const stats = cardStatsMap.get(cardName);
                if (row.tournament_id) {
                    stats.tournaments.add(row.tournament_id);
                }
                const count = parseInt(row.count || 0);
                if (count > 0) {
                    stats.counts.push(count);
                }
            });
            
            // Create new cards array with recalculated stats
            const recalculatedCards = [];
            cardStatsMap.forEach((stats, cardName) => {
                const row = { ...stats.sampleRow };
                
                // Recalculate deck_count (how many decks contain this card)
                const deck_count = stats.tournaments.size;
                
                // max_count = actual maximum copies in any single deck
                let max_count = 0;
                if (stats.counts.length > 0) {
                    max_count = Math.max(...stats.counts);
                }
                
                // Recalculate percentage
                const percentage = totalDecks > 0 ? (deck_count / totalDecks * 100) : 0;
                
                // Recalculate average count
                const avg_count = stats.counts.length > 0 
                    ? (stats.counts.reduce((a, b) => a + b, 0) / stats.counts.length) 
                    : 0;
                
                // Update row with recalculated values
                row.deck_count_in_selected = deck_count;
                row.max_count = max_count;
                row.percentage_in_archetype = percentage.toFixed(1);
                row.avg_count = avg_count.toFixed(2);
                row.total_decks_in_archetype = totalDecks;
                
                recalculatedCards.push(row);
            });
            
            devLog(`Recalculated stats for ${recalculatedCards.length} unique cards based on ${totalDecks} filtered tournaments`);
            return recalculatedCards;
        }
        
        // Aggregate card statistics from filtered tournament data.
        //
        // SHARED FUNCTION: also called by app-current-meta-analysis and
        // app-past-meta with Limitless / Past Meta tournament rows. Those
        // callers must NOT trigger the City-League tournament filter —
        // their tournament_ids (Prague=539, etc.) aren't in the City-
        // League archetypes Set and would all get dropped.
        //
        // Opt-in via options.applyCityLeagueTournamentFilter; defaults to
        // false so non-City-League callers stay unaffected.
        function aggregateCardStatsByDate(filteredCards, options) {
            options = options || {};
            if (options.applyCityLeagueTournamentFilter) {
                filteredCards = _filterCardRowsToKnownTournaments(filteredCards);
            }
            // Group by card_name
            const cardMap = new Map();

            const getAggregationBucketKey = (row) => {
                const tournamentId = String(row.tournament_id || '').trim();
                const period = String(row.period || row.date || row.tournament_date || '').trim();

                if (tournamentId && period) return `${tournamentId}|||${period}`;
                if (tournamentId) return `id:${tournamentId}`;
                if (period) return `period:${period}`;
                return 'global';
            };
            
            // Calculate total decks across all tournaments.
            // For GROUP selections (multiple sub-archetypes), we must SUM
            // deck counts across different archetypes within each tournament,
            // while avoiding double-counting within the same archetype.
            // E.g. Mega Lucario Hariyama (608) + Solrock (196) = 804 in one tournament.
            const tournamentArchetypeDecksMap = new Map();
            filteredCards.forEach(row => {
                const tournamentKey = getAggregationBucketKey(row);
                const archetype = String(row.archetype || '').trim();
                const decksInTournament = parseInt(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0, 10) || 0;
                if (!tournamentArchetypeDecksMap.has(tournamentKey)) {
                    tournamentArchetypeDecksMap.set(tournamentKey, new Map());
                }
                const archetypeMap = tournamentArchetypeDecksMap.get(tournamentKey);
                // Take max per archetype per tournament (avoid double-counting from multiple card rows)
                if (!archetypeMap.has(archetype) || archetypeMap.get(archetype) < decksInTournament) {
                    archetypeMap.set(archetype, decksInTournament);
                }
            });
            // Sum across archetypes within each tournament
            const tournamentDecksMap = new Map();
            tournamentArchetypeDecksMap.forEach((archetypeMap, tournamentKey) => {
                let total = 0;
                archetypeMap.forEach(count => { total += count; });
                tournamentDecksMap.set(tournamentKey, total);
            });
            
            // Sum up decks across all tournaments.
            // If the source rows don't have tournament_date (already aggregated CSV),
            // fall back to the total_decks_in_archetype value carried by the rows.
            let totalDecks = 0;
            tournamentDecksMap.forEach(decks => {
                totalDecks += decks;
            });

            if (totalDecks <= 0) {
                totalDecks = filteredCards.reduce((maxValue, row) => {
                    const rowTotalDecks = parseInt(row.total_decks_in_archetype || row.total_decks || 0, 10) || 0;
                    return Math.max(maxValue, rowTotalDecks);
                }, 0);
            }
            
            devLog('DEBUG: Tournament deck counts:', Array.from(tournamentDecksMap.entries()));
            devLog('DEBUG: Total decks across all tournaments:', totalDecks);
            
            filteredCards.forEach(row => {
                const cardNameRaw = String(row.card_name || row.full_card_name || '').trim();
                const cardName = normalizeCardAggregationKey(cardNameRaw);
                if (!cardName) return;
                
                if (!cardMap.has(cardName)) {
                    const rowWithDisplayName = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    cardMap.set(cardName, {
                        sampleRow: rowWithDisplayName,
                        totalCount: 0,
                        maxCountValues: [],
                        deckCounts: 0,
                        tournamentsWithCard: new Set(),
                        deckCountByTournament: new Map()
                    });
                } else {
                    const cardData = cardMap.get(cardName);
                    // Update sample row if current row has more complete data
                    if (!cardData.sampleRow.image_url && row.image_url) {
                        cardData.sampleRow = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    } else if (!cardData.sampleRow.set_code && row.set_code) {
                        cardData.sampleRow = { ...row, card_name: cardNameRaw || row.card_name || '' };
                    }
                }
                
                const cardData = cardMap.get(cardName);
                
                // Aggregate counts
                cardData.totalCount += parseLocaleNumber(row.total_count || 0, 0);
                const maxCount = parseInt(row.max_count || 0);
                if (maxCount > 0) {
                    cardData.maxCountValues.push(maxCount);
                }
                const rowDeckCount = parseInt(row.deck_count || row.deck_inclusion_count || 0, 10) || 0;
                const tournamentKey = getAggregationBucketKey(row);
                cardData.deckCountByTournament.set(
                    tournamentKey,
                    (cardData.deckCountByTournament.get(tournamentKey) || 0) + rowDeckCount
                );
                
                cardData.tournamentsWithCard.add(tournamentKey);
            });
            
            // Create aggregated result
            const result = [];
            
            cardMap.forEach((data, cardName) => {
                const row = { ...data.sampleRow };
                const legalMaxCopies = getLegalMaxCopies(data.sampleRow?.card_name || cardName, data.sampleRow);
                
                // max_count = actual maximum across all tournament periods
                let max_count = 0;
                if (data.maxCountValues.length > 0) {
                    max_count = Math.max(...data.maxCountValues);
                }

                // Recalculate deckCounts per tournament with cap (prevents split-print double counting).
                // Use the corrected tournamentDecksMap which sums across archetypes for GROUP selections.
                let deckCounts = 0;
                data.deckCountByTournament.forEach((sumDeckCount, tournamentKey) => {
                    const decksInTournament = tournamentDecksMap.get(tournamentKey) || 0;
                    const bounded = decksInTournament > 0 ? Math.min(sumDeckCount, decksInTournament) : sumDeckCount;
                    deckCounts += bounded;
                });

                // Single-deck selection: max_count must equal full card copies in that deck (including mixed prints).
                if (totalDecks === 1) {
                    max_count = Math.round(data.totalCount);
                    deckCounts = deckCounts > 0 ? 1 : 0;
                }

                if (max_count > 0) {
                    max_count = Math.min(max_count, legalMaxCopies);
                }

                const cappedTotalCount = deckCounts > 0
                    ? Math.min(data.totalCount, deckCounts * legalMaxCopies)
                    : data.totalCount;
                
                // Calculate percentage based on actual deck counts
                // data.deckCounts is the sum of deck_count values (number of decks containing this card)
                // totalDecks is the sum of total_decks_in_archetype values (total number of decks in all tournaments)
                // Cap at 100 to prevent > 100% values from data anomalies
                const percentage = totalDecks > 0 ? Math.min(100, (deckCounts / totalDecks * 100)) : 0;
                
                // Calculate averages.
                // average_count = average copies in decks that actually use the card.
                // average_count_overall = average copies across all decks in the archetype.
                const avgCountWhenUsed = Math.min(legalMaxCopies, deckCounts > 0 ? (cappedTotalCount / deckCounts) : 0);
                const avgCountOverall = Math.min(legalMaxCopies, totalDecks > 0 ? (cappedTotalCount / totalDecks) : 0);
                
                // Update row and preserve important fields from sampleRow
                row.total_count = cappedTotalCount;
                row.max_count = max_count;
                row.deck_count = deckCounts;
                row.deck_inclusion_count = deckCounts;
                row.deck_count_in_selected = deckCounts; // Number of decks containing this card
                row.total_decks_in_archetype = totalDecks;
                row.percentage_in_archetype = percentage.toFixed(1);
                row.avg_count = avgCountWhenUsed.toFixed(2);
                row.average_count = avgCountWhenUsed.toFixed(2);
                row.average_count_overall = avgCountOverall.toFixed(2);
                // Explicitly preserve these fields from sampleRow
                row.set_code = data.sampleRow.set_code || '';
                row.image_url = data.sampleRow.image_url || '';
                row.rarity = data.sampleRow.rarity || '';
                row.set_number = data.sampleRow.set_number || '';
                
                // Debug: Log M3 cards
                if (row.set_code === 'M3' || (row.image_url && row.image_url.includes('/M3/'))) {
                    devLog(`M3 card aggregated: ${row.card_name}, set_code: ${row.set_code}, url: ${row.image_url}`);
                }
                
                result.push(row);
            });
            
            devLog(`Aggregated ${result.length} unique cards from ${totalDecks} decks across ${tournamentDecksMap.size} tournaments`);
            return result;
        }

        // Persist City League deck state to localStorage
        function saveCityLeagueDeck() {
            try {
                const deck = window.cityLeagueDeck || {};
                const deckSize = Object.keys(deck).length;

                // Avoid storing empty deck payloads
                if (deckSize === 0) {
                    localStorage.removeItem('cityLeagueDeck');
                    devLog('[City League] Deck is empty - removed from localStorage');
                    return;
                }

                const data = {
                    deck: deck,
                    order: window.cityLeagueDeckOrder || [],
                    archetype: window.currentCityLeagueArchetype || null,
                    pinned: typeof window.pinnedCardsToArray === 'function' ? window.pinnedCardsToArray('cityLeague') : [],
                    excluded: typeof window.excludedCardsToArray === 'function' ? window.excludedCardsToArray('cityLeague') : [],
                    techSlots: typeof window.techSlotsToArray === 'function' ? window.techSlotsToArray('cityLeague') : [],
                    timestamp: new Date().toISOString()
                };

                localStorage.setItem('cityLeagueDeck', JSON.stringify(data));
                devLog('[City League] Deck saved to localStorage:', deckSize, 'cards');
            } catch (e) {
                console.error('[City League] Error saving deck:', e);
            }
        }

        // Ensure cross-file callers (e.g. app-deck-builder.js) can always access it.
        window.saveCityLeagueDeck = saveCityLeagueDeck;
        
        function loadCityLeagueDeckData(archetype) {
            devLog('Loading deck data for:', archetype);
            const data = window.cityLeagueAnalysisData;
            if (!data || data.length === 0) {
                // Analysis-CSV wird im Hintergrund geladen; warte darauf
                if (window._cityLeagueAnalysisPromise) {
                    window._cityLeagueAnalysisPromise.then(() => loadCityLeagueDeckData(archetype));
                }
                return;
            }

            const selection = parseArchetypeSelection(archetype);

            const archetypeStats = getCityLeagueArchetypeStats(archetype);
            
            // Store current archetype
            window.currentCityLeagueArchetype = archetype;
            
            // Check if we have a saved deck for this archetype
            const savedDeck = localStorage.getItem('cityLeagueDeck');
            if (savedDeck) {
                try {
                    const parsed = JSON.parse(savedDeck);
                    if (parsed.archetype === archetype) {
                        // Deck matches current archetype - already loaded
                        devLog('[loadCityLeagueDeckData] Deck already loaded for this archetype');
                    } else {
                        // Different archetype - CLEAR old deck
                        devLog('[loadCityLeagueDeckData] Clearing old deck from different archetype:', parsed.archetype);
                        window.cityLeagueDeck = {};
                        window.cityLeagueDeckOrder = [];
                        saveCityLeagueDeck();
                    }
                } catch (e) {
                    console.error('[loadCityLeagueDeckData] Error reading saved deck:', e);
                }
            }
            
            // Filter cards for this archetype or GROUP selection.
            // Resolve dropdown-side names against the actual archetype labels
            // present in the cards CSV (handles "Mega Lucario Hariyama" vs
            // "Lucario Hariyama" mismatches between the two scrapers).
            const dataArchetypeSet = new Set();
            data.forEach(row => { if (row.archetype) dataArchetypeSet.add(String(row.archetype).trim()); });
            const resolvedTargets = _resolveArchetypeNames(selection.targetArchetypes, dataArchetypeSet);
            const resolvedSet = new Set(resolvedTargets);
            let deckCards = data.filter(row =>
                resolvedSet.has(String(row.archetype || '').trim())
            );
            if (deckCards.length === 0 && selection.targetArchetypes.length > 0) {
                devLog('[archetype-resolver] still 0 cards after fallback — targets:',
                       selection.targetArchetypes, 'resolved:', resolvedTargets);
            }
            devLog('Found cards (before date filter):', deckCards.length);
            
            // Apply date filter if active
            if (window.cityLeagueDateFilterActive) {
                const dateFrom = window.cityLeagueDateFrom;
                const dateTo = window.cityLeagueDateTo;
                
                devLog('DEBUG: Filtering by date range:', dateFrom, 'to', dateTo);
                
                const dateDebugSample = [];
                const hasParseableTournamentDates = deckCards.some(row =>
                    !!parseJapaneseDate(row.tournament_date || row.date || '')
                );
                if (!hasParseableTournamentDates) {
                    console.error('[City League] Date filter requires per-tournament card rows (tournament_date). Current analysis CSV is fully aggregated, so share/average metrics cannot be recalculated by date.');
                    window.currentCityLeagueDeckCards = [];
                    window.currentCityLeagueTotalDecks = 0;
                    clearCityLeagueDeckView();

                    const statusEl = document.getElementById('cityLeagueDateFilterStatus');
                    if (statusEl) {
                        // Befund C (30.08.2026): englischer Scraper-Hinweis
                        // mitten im deutschen Nutzertext.
                        statusEl.textContent = t('cl.dateFilterNoDates');
                        statusEl.classList.add('color-red-light');
                    }
                    return;
                }

                deckCards = deckCards.filter(row => {
                    const rawTournamentDate = row.tournament_date || row.date || '';
                    const tournamentDate = parseJapaneseDate(rawTournamentDate);
                    
                    // Collect first 5 examples for debugging
                    if (dateDebugSample.length < 5) {
                        dateDebugSample.push({
                            raw: rawTournamentDate,
                            parsed: tournamentDate,
                            passes: tournamentDate && tournamentDate >= dateFrom && tournamentDate <= dateTo
                        });
                    }
                    
                    // Strict date filtering: calculations must only use rows with parseable dates in range.
                    if (!tournamentDate) return false;
                    return tournamentDate >= dateFrom && tournamentDate <= dateTo;
                });
                
                devLog('DEBUG: Date filter examples:', dateDebugSample);
                devLog(`Date filter applied (${dateFrom} to ${dateTo}):`, deckCards.length, 'cards');
            }
            
            devLog('Found cards (before deduplication):', deckCards.length);
            
            // Preserve raw per-tournament rows for Recency scoring in Consistency builder
            window.cityLeagueRawDeckCards = deckCards.slice();

            // Always aggregate cards stats (not just when date filter is active)
            // This ensures deck_count is correctly summed across all tournaments.
            // Pass applyCityLeagueTournamentFilter so analysis-only-tournaments
            // (those not yet in archetypes CSV) get dropped — see the
            // 670/645 bug fix in 3c25bf4.
            if (deckCards.length > 0) {
                deckCards = aggregateCardStatsByDate(deckCards, { applyCityLeagueTournamentFilter: true });
                devLog('After aggregating by date:', deckCards.length, 'unique cards');
            }
            
            // Dedupliziere: Nur neueste low-rarity Version pro Karte
            deckCards = deduplicateCards(deckCards);
            devLog('Found cards (after deduplication):', deckCards.length);
            
            // Store unfiltered deck cards for filter function
            window.currentCityLeagueDeckCards = deckCards;
            
            // Kartenzahl der Kachel — Summe der ungerundeten Mittelwerte,
            // nicht der max_count-Werte. Die alte Zeile summierte die je
            // Karte groesste je gesehene Kopienzahl ueber alle Listen des
            // Archetyps und nannte das Ergebnis "Gesamt": eine Deckgroesse
            // von 101 bei 60 erlaubten Karten. Siehe mittlereDeckGroesse().
            const uniqueCards = deckCards.length;
            const deckGroesse = (typeof mittlereDeckGroesse === 'function')
                ? mittlereDeckGroesse(deckCards)
                : { groesse: 0, basis: 'unbekannt' };
            const totalCardsInDeck = deckGroesse.basis === 'unbekannt'
                ? '–' : Math.round(deckGroesse.groesse);
            
            // Two distinct deck counts that USED to be one variable —
            // splitting them resolves the user complaint that "Decks
            // Used" (312) doesn't match the dropdown ("645 Decks") on
            // the JP Deck Analysis tab.
            //
            // displayDecksCount  → what the "Decks Used" stat-card
            //                      shows. Sourced from archetypes CSV
            //                      (= dropdown count). Honest answer
            //                      to "how many decks of this archetype
            //                      are in the meta within the active
            //                      date filter": 645 unfiltered, less
            //                      with a date range applied.
            //
            // cardStatsDenom     → denominator B in the card-inclusion
            //                      M/B percentages on each card tile.
            //                      Sourced from the analysis CSV's
            //                      total_decks_in_archetype because M
            //                      (numerator) is also analysis-side
            //                      — keeping them on the same data
            //                      basis prevents the 670/645 = 100,1 %
            //                      bug fixed in 3c25bf4 + e5c00de.
            //
            // The two will diverge whenever the analysis pipeline can't
            // reproduce a decklist the archetypes scrape recorded
            // (tournament has a Mega Lucario placement but the analysis
            // scraper hit max_decklists_per_league before getting to
            // that player, etc.). That gap is fundamental to the
            // analysis scraper's per-tournament cap and won't close
            // without a scraper-policy change.
            const analysisAggregated = parseInt(deckCards[0]?.total_decks_in_archetype || 0, 10);
            const cardStatsDenom = analysisAggregated
                || archetypeStats.decksCount
                || getSelectedCityLeagueDeckCount(archetype)
                || getCityLeagueDeckCountFallback(archetype)
                || 0;
            let displayDecksCount = archetypeStats.decksCount
                || getSelectedCityLeagueDeckCount(archetype)
                || analysisAggregated
                || getCityLeagueDeckCountFallback(archetype);
            if (!displayDecksCount || displayDecksCount <= 0) {
                displayDecksCount = '-';
            }
            devLog(`Deck counts — display=${displayDecksCount}, cardStatsDenom=${cardStatsDenom} (analysis=${analysisAggregated}, archetypes=${archetypeStats.decksCount})`);

            // Calculate average placement from archetypes data
            const avgPlacement = archetypeStats.avgPlacement;

            // The global is read by per-card percentage math (lines
            // 2639 / 2908) — keep it on the analysis-side total so the
            // M/B percentages stay capped at 100 %.
            window.currentCityLeagueTotalDecks = cardStatsDenom;
            devLog(`Stored global card-stats denom: ${window.currentCityLeagueTotalDecks}`);

            // Update stats — Decks Used shows the dropdown count
            // (matches what the user picked) instead of the analysis
            // total (which is implementation-detail of card-stat math).
            updateDeckStatsByIds({
                cityLeagueStatCards: `${uniqueCards} / ${totalCardsInDeck}`,
                cityLeagueStatDecksUsed: displayDecksCount,
                cityLeagueStatAvgPlacement: avgPlacement !== '-' ? avgPlacement : '-'
            }, 'cityLeagueStatsSection');
            
            // Befund B (30.08.2026): hier wurde die englische Zeichenkette
            // fuer die Listenansicht fest in den Knopf geschrieben —
            // auch wenn die Seite deutsch war. Das war
            // die gemessene STARTbeschriftung dieses Reiters. Der Helfer
            // setzt den Zustand (nach dem Neuaufbau steht das Raster) und
            // beschriftet in der aktiven Sprache.
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => window.ansichtsUmschalterBeschriften(btn, 'grid'));
            
            // Apply current filter (this renders the grid - do not call renderCityLeagueDeckGrid separately)
            applyCityLeagueFilter();
            
            // DON'T auto-display deck here - let the caller decide
            // (only display when user actively selects archetype from dropdown)
        }
        
        function clearCityLeagueDeckView() {
            ['cityLeagueStatsSection', 'cityLeagueDeckVisual', 'cityLeagueDeckTableView'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('d-none');
            });
            resetDeckOverviewCounts('cityLeagueCardCount', 'cityLeagueCardCountSummary', '0 ' + t('cl.cards'), '/ 0 ' + t('cl.total'));
            
            // Wie oben: fester englischer Wortlaut ersetzt (Befund B,
            // 30.08.2026). Nach dem Leeren steht wieder das Raster.
            const gridButtons = document.querySelectorAll('button[onclick="toggleDeckGridView()"]');
            gridButtons.forEach(btn => window.ansichtsUmschalterBeschriften(btn, 'grid'));
        }
        
        function normalizeSetCode(rawSetCode) {
            return String(rawSetCode || '').toUpperCase().trim();
        }

        function normalizeCardNumber(rawCardNumber) {
            const raw = String(rawCardNumber || '').trim();
            if (!raw) return '';

            // Remove query/hash fragments often passed by translated proxy URLs.
            const noFragment = raw.split('?')[0].split('#')[0].trim();
            if (!noFragment) return '';

            // Keep a conservative set for valid card numbers (digits, letters, hyphen, slash).
            const cleaned = noFragment.replace(/[^0-9A-Za-z\-\/]/g, '');
            if (!cleaned) return '';

            // Normalize pure numeric values by dropping leading zeroes.
            if (/^\d+$/.test(cleaned)) {
                return cleaned.replace(/^0+/, '') || '0';
            }

            return cleaned;
        }

        // Helper function to get Limitless Japanese fallback URL for M3/M4 cards
        function getM3JapaneseFallbackUrl(setCode, cardNumber) {
            const num = normalizeCardNumber(cardNumber);
            if (!num) return '';
            const normalizedSet = normalizeSetCode(setCode || 'M3');
            return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/${normalizedSet}/${normalizedSet}_${num}_R_JP_LG.png`;
        }

        function getIndexedCardBySetNumber(setCode, cardNumber) {
            const normalizedSet = normalizeSetCode(setCode);
            const rawNumber = normalizeCardNumber(cardNumber);
            if (!normalizedSet || !rawNumber) {
                return null;
            }

            if (cardIndexBySetNumber instanceof Map && cardIndexBySetNumber.size > 0) {
                const exactMatch = cardIndexBySetNumber.get(`${normalizedSet}-${rawNumber}`);
                if (exactMatch) return exactMatch;

                const normalizedNumber = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
                const normalizedMatch = cardIndexBySetNumber.get(`${normalizedSet}-${normalizedNumber}`);
                if (normalizedMatch) return normalizedMatch;

                const paddedMatch = cardIndexBySetNumber.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
                if (paddedMatch) return paddedMatch;
            }

            return null;
        }

        function getCanonicalCardRecord(setCode, cardNumber) {
            const indexedCard = getIndexedCardBySetNumber(setCode, cardNumber);
            if (indexedCard) {
                return indexedCard;
            }

            const normalizedSet = normalizeSetCode(setCode);
            const rawNumber = normalizeCardNumber(cardNumber);
            if (!normalizedSet || !rawNumber || !cardsBySetNumberMap) {
                return null;
            }

            const exactKey = `${normalizedSet}-${rawNumber}`;
            if (cardsBySetNumberMap[exactKey]) {
                return cardsBySetNumberMap[exactKey];
            }

            const normalizedNumber = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
            const normalizedKey = `${normalizedSet}-${normalizedNumber}`;
            if (cardsBySetNumberMap[normalizedKey]) {
                return cardsBySetNumberMap[normalizedKey];
            }

            const paddedNumber = normalizedNumber.padStart(3, '0');
            const paddedKey = `${normalizedSet}-${paddedNumber}`;
            return cardsBySetNumberMap[paddedKey] || null;
        }

        function getUnifiedCardImage(set, number) {
            const normalizedSet = normalizeSetCode(set);
            const rawNumber = normalizeCardNumber(number);
            if (!normalizedSet || !rawNumber) {
                return '';
            }

            // 0. pokemonproxies.com override for Japanese-only sets (e.g. M5):
            //    these have no international print, so we prefer the English
            //    proxy art here over the Japanese Limitless fallback (step 4).
            //    The index only contains such sets, so international cards are
            //    unaffected. Number matched unpadded (index keys use unpadded).
            const ppx = window.pokemonProxiesIndex;
            if (ppx) {
                const plainNum = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
                const hit = ppx[`${normalizedSet}-${rawNumber}`] || ppx[`${normalizedSet}-${plainNum}`];
                if (hit) return hit;
            }

            // 0b. Synthetic "PPS{series}{baseSet}" prints resolve to their stamped
            //     Play! Pokémon Prize Pack image (proxy printing, collection
            //     views, etc.). The base set is part of the id because a series
            //     spans several sets — without it 26 card pairs collided and the
            //     proxy printer produced the wrong card.
            if (/^PPS\d+[A-Z0-9]*$/.test(normalizedSet)) {
                if (window.prizePackSynthImages) {
                    const plainNum = /^\d+$/.test(rawNumber) ? (rawNumber.replace(/^0+/, '') || '0') : rawNumber;
                    const psHit = window.prizePackSynthImages[`${normalizedSet}-${rawNumber}`]
                               || window.prizePackSynthImages[`${normalizedSet}-${plainNum}`];
                    if (psHit) return psHit;
                }
                // Never fall through to the EN/JP CDN guesses below: those build
                // a URL that is guaranteed to 404 for a PPS id and would print a
                // blank proxy card.
                return '';
            }

            const card = getIndexedCardBySetNumber(normalizedSet, rawNumber);

            // 1. Canonical image from all_cards_merged
            if (card && (card.image || card.image_url)) {
                return fixJapaneseCardImageUrl(card.image || card.image_url, normalizedSet, card.name || '', card.number || rawNumber);
            }

            // 2. Proactive PokemonProxies standard route for M3/M4
            if (normalizedSet === 'M3' || normalizedSet === 'M4') {
                return `https://pokemonproxies.com/images/${normalizedSet.toLowerCase()}/${rawNumber}.png`;
            }

            // 3. EN Limitless CDN fallback for 3-letter EN set codes that
            //    haven't landed in all_cards_merged yet. Covers the gap
            //    between a new EN set release (e.g. CRI on 2026-05-22)
            //    and the weekly all_cards_scraper rebuild. Pattern mirrors
            //    the canonical DB image_url for POR/JTG/etc.: zero-padded
            //    number, '_R_EN_LG.png' suffix, '/tpci/' (international).
            //    Restricted to /^[A-Z]{3}$/ so we don't construct bogus
            //    URLs for promos (P1-P9), 2-letter legacy sets, or
            //    M-prefix JP codes (those fall through to step 4).
            if (/^[A-Z]{3}$/.test(normalizedSet) && !/^M\d+$/.test(normalizedSet)) {
                const padded = /^\d+$/.test(rawNumber) ? rawNumber.padStart(3, '0') : rawNumber;
                return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${normalizedSet}/${normalizedSet}_${padded}_R_EN_LG.png`;
            }

            // 4. Last fallback: Japanese Limitless URL (M5+, unknown codes)
            return getM3JapaneseFallbackUrl(normalizedSet, rawNumber);
        }

        function isBasicEnergyCardEntry(cardLike) {
            if (!cardLike) return false;

            // 1) Safest check via official card metadata.
            if (cardLike.supertype === 'Energy' && Array.isArray(cardLike.subtypes) && cardLike.subtypes.includes('Basic')) {
                return true;
            }

            // 2) Bulletproof name check for the 8 basic energies and common aliases.
            const basicNames = [
                'Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy',
                'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
                'Basic {G} Energy', 'Basic {R} Energy', 'Basic {W} Energy', 'Basic {L} Energy',
                'Basic {P} Energy', 'Basic {F} Energy', 'Basic {D} Energy', 'Basic {M} Energy'
            ];
            const cardName = String(cardLike.card_name || cardLike.full_card_name || cardLike.name || '').trim();
            if (basicNames.includes(cardName)) return true;
            if (isBasicEnergy(cardName)) return true;

            // 3) Fallback for localized explicit labels.
            if (cardLike.type === 'Basis-Energie' || cardLike.supertype === 'Basis-Energie') return true;

            // Everything else must be treated as Special Energy (4x cap applies).
            return false;
        }

        // Frueher hiess diese Funktion getEmptyStateHtml - genauso wie
        // die in app-utils.js, und beide standen auf oberster Ebene.
        // app-city-league.js laedt spaeter, also gewann diese: jeder
        // Aufruf von window.getEmptyStateHtml({...}) landete hier, wo
        // die Argumente ignoriert werden. Die leere Wunschliste sagte
        // deshalb "Fuer diese Filterkombination liegen aktuell keine
        // Turnierdaten vor." Der Name ist jetzt eindeutig.
        function cityLeagueNoDataHtml() {
            return getEmptyStateBoxHtml({
                title: t('cl.noDataFound'),
                description: t('cl.noDataFoundDesc'),
                icon: 'cards'
            });
        }

        // Universal image URL resolver used across grids, analysis, and deckbuilder.
        // Priority order:
        //  1. canonical image from all_cards_merged via set+number index
        //  2. unified set+number fallback chain
        //  3. row-level image only when no set+number is available
        function getBestCardImage(card) {
            const setCodeRaw = card?.set_code || card?.set || '';
            const setCode = String(setCodeRaw || '').toUpperCase();
            const cardNumberRaw = card?.set_number || card?.number || '';
            const cardNumber = String(cardNumberRaw || '').trim();
            const imageUrl = card?.image_url || card?.imageUrl || card?.image || '';

            if (setCode && cardNumber) {
                return getUnifiedCardImage(setCode, cardNumber);
            }

            return imageUrl ? fixJapaneseCardImageUrl(imageUrl, setCode, card?.card_name || card?.name || '', cardNumber) : '';
        }

        /**
         * Named explicit-API version of getBestCardImage.
         * getCardImageSource(cardName, set, number) mirrors getBestCardImage's
         * full priority chain (DB image_url → row image_url → Limitless-JP fallback)
         * but accepts individual params instead of a card object.
         */
        function getCardImageSource(cardName, set, number) {
            return getUnifiedCardImage(set, number) || getBestCardImage({ card_name: cardName, set_code: set, set_number: number });
        }

        function classifyImageSource(url) {
            const src = String(url || '').toLowerCase();
            if (!src) return 'none';
            if (src.includes('pokemonproxies.com')) return 'proxy';
            if (src.includes('limitlesstcg') && src.includes('/tpc/')) return 'limitless-jp';
            if (src.includes('limitlesstcg') && src.includes('/tpci/')) return 'limitless-en';
            if (src.startsWith('data:image/svg')) return 'placeholder';
            return 'other';
        }

        function buildInlineCardPlaceholder(cardName = 'No Image') {
            const safeLabel = String(cardName || 'No Image').slice(0, 32);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2a2a2a"/><stop offset="100%" stop-color="#3a3a3a"/></linearGradient></defs><rect width="245" height="342" fill="url(#g)"/><rect x="10" y="10" width="225" height="322" rx="12" ry="12" fill="none" stroke="#666" stroke-width="2"/><text x="50%" y="47%" dominant-baseline="middle" text-anchor="middle" fill="#cfcfcf" font-size="17" font-family="Arial, sans-serif">No Image</text><text x="50%" y="56%" dominant-baseline="middle" text-anchor="middle" fill="#9f9f9f" font-size="12" font-family="Arial, sans-serif">${safeLabel}</text></svg>`;
            return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        }

        if (!window.__cardImageSourceTrackingBound) {
            // Capture image load events globally and tag each card image with its source.
            document.addEventListener('load', function(e) {
                const target = e.target;
                if (!target || target.tagName !== 'IMG') return;
                const sourceType = classifyImageSource(target.currentSrc || target.src || '');
                target.setAttribute('data-image-source', sourceType);
            }, true);
            window.__cardImageSourceTrackingBound = true;
        }
        
        // Global function to handle image errors with one fallback retry.
        window.handleCardImageError = function(img, setCode = '', cardNumber = '', explicitFallbackUrl = '') {
            if (img.getAttribute('data-fallback-tried') === 'true') {
                // All fallbacks exhausted – show inline SVG placeholder
                img.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22200%22 height%3D%22280%22%3E%3Crect width%3D%22200%22 height%3D%22280%22 fill%3D%22%23333%22%2F%3E%3Ctext x%3D%2250%25%22 y%3D%2250%25%22 dominant-baseline%3D%22middle%22 text-anchor%3D%22middle%22 fill%3D%22%23999%22 font-size%3D%2218%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                img.classList.add('img-fallback');
                return;
            }

            let fallbackUrl = explicitFallbackUrl || '';
            const src = img.getAttribute('src') || '';
            const normalizedSet = normalizeSetCode(setCode);
            const normalizedNumber = normalizeCardNumber(cardNumber);

            // For M3/M4 cards, fallback to Limitless JP when the primary URL fails.
            if (!fallbackUrl) {
                const isM3M4 = (normalizedSet === 'M3' || normalizedSet === 'M4' || /\/(M3|M4)\//i.test(src));
                if (isM3M4) {
                    const fallbackSet = normalizedSet === 'M4' ? 'M4' : 'M3';
                    fallbackUrl = getM3JapaneseFallbackUrl(fallbackSet, normalizedNumber);
                }
            }

            // For 3-letter EN sets, construct the canonical Limitless-EN URL
            // as a fallback (covers CRI and any future EN set that lands
            // before the cards-DB scraper rebuilds).
            if (!fallbackUrl && /^[A-Z]{3}$/.test(normalizedSet) && !/^M\d+$/.test(normalizedSet) && normalizedNumber) {
                const padded = /^\d+$/.test(normalizedNumber) ? normalizedNumber.padStart(3, '0') : normalizedNumber;
                fallbackUrl = `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${normalizedSet}/${normalizedSet}_${padded}_R_EN_LG.png`;
            }

            if (fallbackUrl) {
                devLog(`Image Error → Trying fallback: ${fallbackUrl}`);
                img.setAttribute('data-fallback-tried', 'true');
                img.setAttribute('data-image-source', 'fallback-limitless');
                img.src = fallbackUrl;
            } else {
                // No fallback URL available – show placeholder immediately
                img.src = 'data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%22200%22 height%3D%22280%22%3E%3Crect width%3D%22200%22 height%3D%22280%22 fill%3D%22%23333%22%2F%3E%3Ctext x%3D%2250%25%22 y%3D%2250%25%22 dominant-baseline%3D%22middle%22 text-anchor%3D%22middle%22 fill%3D%22%23999%22 font-size%3D%2218%22%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                img.classList.add('img-fallback');
            }
        };

        // (2026-06-10 audit) window.handleM3ImageError removed — zero
        // inline-onerror references still hit this shim. handleCardImageError
        // is the live path and accepts an explicit fallback URL.


        // Helper function to fix Japanese card image URLs with intelligent fallback logic
        function fixJapaneseCardImageUrl(url, setCode, cardName = '', cardNumber = '') {
            if (!url) return url;

            // Prefer any direct PokemonProxies image URL from the merged card database.
            if (/pokemonproxies\.com\/(assets|images\/cards\/sets)\//i.test(url)) {
                return url;
            }
            
            // PRIORITY 1: M3 fallback from Limitless/TPCI to Limitless JP.
            const isM3Set = setCode === 'M3' || url.includes('/M3/');
            
            if (isM3Set) {
                // Extract card number if not provided
                if (!cardNumber && url) {
                    const numberMatch = url.match(/M3_0*(\d+)_/);
                    if (numberMatch) {
                        cardNumber = numberMatch[1]; // 46 or 046
                    }
                }
                
                // M3 Fallback: Limitless Japanese
                const originalUrl = url;
                url = url.replace('/tpci/', '/tpc/');
                url = url.replace(/_EN_/g, '_JP_');
                url = url.replace(/\/M3_0+(\d+)_/g, '/M3_$1_');
                devLog(`🇯🇵 M3 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
                return url;
            }

            const isM4Set = setCode === 'M4' || url.includes('/M4/');
            if (isM4Set) {
                const originalUrl = url;
                url = url.replace('/tpci/', '/tpc/');
                url = url.replace(/_EN_/g, '_JP_');
                url = url.replace(/\/M4_0+(\d+)_/g, '/M4_$1_');
                devLog(`🇯🇵 M4 Card → Limitless JP fallback: ${originalUrl} → ${url}`);
                return url;
            }
            
            // Keep other real image URLs unchanged.
            if (/\.(png|jpe?g|webp)(\?|$)/i.test(url)) {
                return url;
            }

            // Generic JP fallback only if we can safely derive a Limitless image URL.
            if (url.includes('/jp/')) {
                if (setCode && cardNumber) {
                    return getM3JapaneseFallbackUrl(setCode, cardNumber);
                } else {
                    // Fallback: Replace /jp/ with /en/ if we don't have set/number info
                    const originalUrl = url;
                    url = url.replace('/jp/', '/en/');
                    devLog(`Japanese → English Proxy: ${originalUrl} → ${url}`);
                    return url;
                }
            }
            
            // Default: return original URL unchanged
            return url;
        }
        
        // Render function for table view (default, detailed view)
        function renderCityLeagueDeckTable(cards) {
            const tableContainer = document.getElementById('cityLeagueDeckTable');
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            if (!tableContainer) return;
            
            // Use the same sorting logic
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.cityLeagueDeck || {};
            
            let html = '<div class="city-league-card-table-list">';
            sortedCards.forEach(card => {
                const cardName = card.card_name;
                
                // CRITICAL: Use same version selection logic as Grid View
                // This ensures List View shows the same version (e.g., ASC instead of MEG)
                let displayCard = card;
                const allCards = window.allCardsDatabase || [];
                const allVersions = allCards.filter(c => (c.name_en || c.name) === cardName && c.set && c.number);
                
                if (overviewRarityMode !== 'all' && allVersions.length > 0) {
                    // Set order loaded from sets.json at startup (higher = newer)
                    const SET_ORDER = window.setOrderMap || {};
                    
                    const getRarityValue = (card) => {
                        const r = (card.rarity || card.card_rarity || '').toLowerCase();
                        if (!r || r === '' || r === 'none' || r === 'no rarity') return 0;
                        if (r.includes('common')) return 1;
                        if (r.includes('uncommon')) return 2;
                        if (r.includes('rare') && !r.includes('ultra') && !r.includes('secret') && !r.includes('hyper')) return 3;
                        if (r.includes('promo')) return 4;
                        if (r.includes('double rare')) return 5;
                        if (r.includes('ultra rare')) return 6;
                        if (r.includes('special art rare') || r.includes('special illustration rare')) return 7;
                        if (r.includes('secret rare')) return 8;
                        if (r.includes('hyper rare')) return 9;
                        return -1;
                    };
                    
                    allVersions.sort((a, b) => {
                        const rarityA = getRarityValue(a);
                        const rarityB = getRarityValue(b);
                        
                        // Primary sort: by rarity value
                        const rarityDiff = overviewRarityMode === 'min' ? rarityA - rarityB : rarityB - rarityA;
                        if (rarityDiff !== 0) {
                            return rarityDiff;
                        }
                        
                        // Secondary sort (same rarity): prefer NEWER sets (ASC > MEG)
                        const setOrderA = SET_ORDER[a.set] || 0;
                        const setOrderB = SET_ORDER[b.set] || 0;
                        return setOrderB - setOrderA;
                    });
                    
                    const preferredVersion = allVersions[0];
                    displayCard = {
                        ...card,
                        set_code: preferredVersion.set,
                        set_number: preferredVersion.number,
                        image_url: preferredVersion.image_url || card.image_url
                    };
                }
                
                const imageUrl = getBestCardImage({
                    ...displayCard,
                    card_name: cardName
                });
                const rawPercentage = safeParseFloat(card.percentage_in_archetype || card.share_percent || 0);
                const maxCount = parseInt(card.max_count) || card.max_count || '?';
                const cardNameEscaped = escapeJsStr(cardName);
                const setCode = displayCard.set_code || '';
                const setNumber = displayCard.set_number || '';
                
                // CRITICAL: Match by SET CODE + SET NUMBER only (not card name)
                let deckCount = 0;
                if (setCode && setNumber) {
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
                } else {
                    deckCount = currentDeck[cardName] || 0;
                }
                
                // Get deck statistics
                const decksWithCard = safeParseFloat(card.deck_count || card.deck_inclusion_count || 0);
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = safeParseFloat(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0);
                const totalCount = safeParseFloat(card.total_count || 0);
                const avgCountOverallRaw = safeParseFloat(card.average_count_overall || '', NaN);
                const avgCountInUsedRaw = safeParseFloat(card.average_count || card.avg_count || '', NaN);

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                    ? avgCountOverallRaw
                    : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);
                const avgCountInUsedValue = Number.isFinite(avgCountInUsedRaw) && avgCountInUsedRaw > 0
                    ? avgCountInUsedRaw
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);

                const percentage = Math.min(100, Math.max(0, resolvedPercentage)).toFixed(1).replace('.', ',');
                const avgCountOverall = Math.max(0, avgCountOverallValue).toFixed(2).replace('.', ',');
                const avgCountInUsedDecks = Math.max(0, avgCountInUsedValue).toFixed(2).replace('.', ',');
                const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                
                html += `
                    <div class="card-table-row city-league-card-table-row" data-card-name="${cardName.toLowerCase()}">
                        <!-- Card Image -->
                        <div class="city-league-card-image-container">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                            ${deckCount > 0 ? `<div class="city-league-card-deck-count">${deckCount}</div>` : ''}
                            ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                        </div>
                        <!-- Card Info -->
                        <div class="city-league-card-info">
                            <h3 class="city-league-card-title">${cardName}</h3>
                            <div class="city-league-card-set">${setCode} ${setNumber}</div>
                            <div class="city-league-card-stats">
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.usageShare')}</span>
                                    <span class="city-league-card-stat-value">${percentage}%</span>
                                  </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.avgUsedDecks')}</span>
                                    <span class="city-league-card-stat-value">${avgCountInUsedDecks}x</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.avgAllDecks')}</span>
                                    <span class="city-league-card-stat-value">${avgCountOverall}x</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.deckCount')}</span>
                                    <span class="city-league-card-stat-value">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</span>
                                </div>
                                <div>
                                    <span class="city-league-card-stat-label">${t('cl.maxCount')}</span>
                                    <span class="city-league-card-stat-value city-league-card-stat-value-max">${maxCount}</span>
                                </div>
                            </div>
                        </div>
                        <!-- Add Button -->
                        <div class="city-league-card-actions">
                            <button class="btn btn-success city-league-card-add-btn" onclick="addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">${t('cl.addToDeck')}</button>
                            <button class="btn btn-primary city-league-card-proxy-btn" onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" title="${t('cl.proxyTooltip')}">${t('cl.proxy')}</button>
                        </div>
                    </div>`;
                // ...existing code...
            }); // Ende der forEach-Schleife
            html += '</div>';
            tableContainer.innerHTML = html;
            if (tableViewContainer) tableViewContainer.classList.remove('d-none', 'city-league-deck-table-view-hidden');
        }
        
        // Get all versions of a card from allCardsDatabase
        function getAllVersionsOfCard(cardName) {
            const allCards = window.allCardsDatabase || [];
            return allCards.filter(c => c.name === cardName);
        }
        
        // Set overview rarity mode and refresh display
        function setOverviewRarityMode(mode) {
            debugVersionSelectionLog('[Config] Setting overview rarity mode to:', mode);
            overviewRarityMode = mode;
            
            // Synchronize with global rarity preference so deck builder uses same setting
            // For 'all' mode, keep original cards (no preference), otherwise use min/max
            if (mode === 'all') {
                // For "Alle Prints" mode in deck builder, use original card (no rarity swap)
                globalRarityPreference = null;
            } else {
                globalRarityPreference = mode; // 'min' or 'max'
            }
            debugVersionSelectionLog('Global rarity preference synced to:', globalRarityPreference || 'none (original cards)');
            
            // Update button styles - make sure elements exist first
            const btnMin = document.getElementById('overviewRarityMin');
            const btnMax = document.getElementById('overviewRarityMax');
            const btnAll = document.getElementById('overviewRarityAll');
            
            if (btnMin) {
                btnMin.classList.toggle('btn-active', mode === 'min');
                btnMin.classList.toggle('btn-inactive', mode !== 'min');
            }
            if (btnMax) {
                btnMax.classList.toggle('btn-active', mode === 'max');
                btnMax.classList.toggle('btn-inactive', mode !== 'max');
            }
            if (btnAll) {
                btnAll.classList.toggle('btn-active', mode === 'all');
                btnAll.classList.toggle('btn-inactive', mode !== 'all');
            }
            
            // Re-render the grid with current cards (preserve percentage filter)
            const cards = window.currentCityLeagueDeckCards;
            debugVersionSelectionLog('Cards available for re-render:', cards ? cards.length : 'none');
            if (cards && cards.length > 0) {
                debugVersionSelectionLog('Re-rendering grid with mode:', mode);
                applyCityLeagueFilter();  // Use filter function to preserve percentage filter
            } else {
                debugVersionSelectionLog('[WARN] No cards available to render - mode saved for when deck is selected');
            }
            
            // Also update the deck display with new rarity preference
            if (window.cityLeagueDeck && Object.keys(window.cityLeagueDeck).length > 0) {
                debugVersionSelectionLog('Re-rendering deck with new rarity preference');
                updateDeckDisplay('cityLeague');
            }
        }
        
        // ============================================================================
        // TREND CALCULATION - Calculate usage trends over time
        // ============================================================================
        // Render function for grid view (compact view)
        function renderCityLeagueDeckGrid(cards) {
            debugVersionSelectionLog('renderCityLeagueDeckGrid called with:', cards.length, 'cards, mode:', overviewRarityMode);
            const visualContainer = document.getElementById('cityLeagueDeckVisual');
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
            if (!gridContainer) {
                console.warn('[CityLeague] cityLeagueDeckGrid container not found - cannot render card overview grid');
                return;
            }

            if (!Array.isArray(cards) || cards.length === 0) {
                console.info('[CityLeague] Rendering empty card overview state (0 cards after filtering)');
                gridContainer.innerHTML = cityLeagueNoDataHtml();
                if (visualContainer) {
                    visualContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                    visualContainer.style.display = 'block';
                }
                return;
            }
            
            // Use the same sorting logic as "Karten Uebersicht (sortiert)"
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck to show deck counts
            const currentDeck = window.cityLeagueDeck || {};
            const priceMap = getOverviewPriceLookupCache();
            
            // PERFORMANCE: Resolve once outside render loop (avoids repeated DOM query + N*M data scans)
            const selectedArchetypeForTrend = document.getElementById('cityLeagueArchetypeSelect')?.value || window.currentCityLeagueArchetype || 'all';
            const trendHistoryCache = new Map();

            // Decklist Skeleton activation flag — only when ONE specific
            // archetype is selected. For "All Archetypes" the flat layout
            // stays (cross-archetype share semantics differ).
            const useSkeletonLayout = selectedArchetypeForTrend && selectedArchetypeForTrend !== 'all';
            const SKELETON_MAIN_MIN  = 85; // staples
            const SKELETON_NICHE_MAX = 50; // below this = situational
            // Titel des Anteilsbands. Steht einmal hier statt in jeder
            // Kartenzeile — 60 Karten mal derselbe String.
            const USAGE_TITLE = (typeof t === 'function' && t('cl.usageBarTitle'))
                || (typeof getLang === 'function' && getLang() === 'en'
                    ? 'of the analysed lists play this card'
                    : 'der ausgewerteten Listen spielen diese Karte');

            // cardHtmls now holds objects so we can bucket by usage % at the
            // end. Each entry: { html, pct } — multiple versions of the same
            // card share the same pct.
            const cardHtmls = [];
            sortedCards.forEach(card => {
                // Get original card's set/number from the City League deck data
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = escapeJsStr(cardName);
                
                // Apply rarity mode to determine which versions to show
                let versionsToRender = [];
                
                if (overviewRarityMode === 'all') {
                    // Show ALL international prints of this specific card
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    debugVersionSelectionLog(`All mode for ${cardName} (${originalSetCode} ${originalSetNumber}): found ${allVersions.length} int prints`);
                    
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        // No versions found in database, use original card
                        versionsToRender = [card];
                    }
                } else {
                    // 'min' or 'max' mode: Get preferred version (lowest/highest rarity, prefer NEWER sets)
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    
                    if (preferredVersion) {
                        debugVersionSelectionLog(`${overviewRarityMode} mode for ${cardName}: using PREFERRED version ${preferredVersion.set} ${preferredVersion.number} (${preferredVersion.rarity})`);
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        // No preferred version found, use original
                        debugVersionSelectionLog(`${overviewRarityMode} mode for ${cardName}: no preferred version found, using original`);
                        versionsToRender = [card];
                    }
                }
                
                // Render each version
                versionsToRender.forEach(displayCard => {
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const cardNameWarning = getNameWarningHtml(rawCardName, cardName, setCode, setNumber);
                
                const imageUrl = getBestCardImage({
                    ...displayCard,
                    set_code: setCode,
                    set_number: setNumber,
                    card_name: cardName
                });
                const rawPercentage = safeParseFloat(card.percentage_in_archetype || card.share_percent || 0);
                
                const legalMaxCopies = getLegalMaxCopies(cardName, card);
                const rawMaxCount = parseInt(card.max_count) || 0;
                const totalCount = safeParseFloat(card.total_count || 0);
                const decksWithCard = safeParseFloat(card.deck_count || card.deck_inclusion_count || 0);
                // finalMaxCount = highest copies of this card (across all int prints) used in any single deck
                const finalMaxCount = rawMaxCount > 0
                    ? Math.min(legalMaxCopies, rawMaxCount)
                    : 0;
                
                // CRITICAL: ALWAYS show green marker ONLY on the exact version that is in the deck
                // Match by SET CODE + SET NUMBER only (not by card name, which may differ in different languages)
                let deckCount = 0;
                
                // Only check if deck is not empty to avoid unnecessary processing
                if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                    // Loop through all deck entries and match by set/number only
                    for (const deckKey in currentDeck) {
                        // Extract set and number from deckKey format: "CardName (SET NUM)"
                        const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        if (match) {
                            const deckSetCode = match[1];
                            const deckSetNumber = match[2];
                            
                            // Match by set code and number ONLY (ignore card name)
                            if (deckSetCode === setCode && deckSetNumber === setNumber) {
                                deckCount = currentDeck[deckKey] || 0;
                                break;
                            }
                        }
                    }
                } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                    // Fallback: If no set/number available, try exact card name match
                    deckCount = currentDeck[cardName] || 0;
                }
                
                // Get deck statistics: how many decks use this card vs total decks in archetype
                // Use global total decks count instead of per-date total_decks_in_archetype
                const totalDecksInArchetype = safeParseFloat(window.currentCityLeagueTotalDecks || card.total_decks_in_archetype || 0);
                // Get average count statistics

                const avgCountOverallRaw = safeParseFloat(card.average_count_overall || '', NaN);
                const avgCountInUsedRaw = safeParseFloat(card.average_count || card.avg_count || '', NaN);

                const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                    ? rawPercentage
                    : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                    ? avgCountOverallRaw
                    : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);
                const avgCountInUsedValue = Number.isFinite(avgCountInUsedRaw) && avgCountInUsedRaw > 0
                    ? avgCountInUsedRaw
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);

                // finalMaxCount already declared above, do not redeclare here.
                const finalAvgUsed = Math.min(legalMaxCopies, avgCountInUsedValue);
                const finalAvgOverall = Math.min(legalMaxCopies, avgCountOverallValue);
                const maxCount = finalMaxCount;

                const percentage = Math.min(100, Math.max(0, resolvedPercentage)).toFixed(1).replace('.', ',');
                const avgCountOverall = Math.max(0, finalAvgOverall).toFixed(2).replace('.', ',');  // Average over all decks
                const avgCountInUsedDecks = Math.max(0, finalAvgUsed).toFixed(2).replace('.', ',');  // Average in decks that use this card
                const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                const selectedArchetype = selectedArchetypeForTrend;
                const trendCacheKey = cardName + '||' + selectedArchetype;
                if (!trendHistoryCache.has(trendCacheKey)) {
                    trendHistoryCache.set(trendCacheKey, getCityLeagueCardShareHistory(cardName, selectedArchetype));
                }
                const trendHistory = trendHistoryCache.get(trendCacheKey);
                const trendIndicator = getTrendIndicator(trendHistory);
                const showTrendOverlay = trendIndicator && !trendIndicator.includes('trend-stable');
                
                // PERFORMANCE: Get price using Map lookup instead of find()
                let eurPrice = '';
                let cardmarketUrl = '';
                let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                if (setCode && setNumber) {
                    const normalizedSet = normalizeSetCode(setCode);
                    const normalizedNumber = normalizeCardNumber(setNumber);
                    let priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber}`);
                    
                    // If no exact match, try with normalized numbers (remove leading zeros)
                    if (!priceCard && /^\d+$/.test(normalizedNumber)) {
                        priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
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
                
                // Determine card type category for filtering
                const cardType = card.type || card.card_type || '';
                const cardCategory = getCardTypeCategory(cardType);
                const isAceSpecCard = isAceSpec(cardName);
                const filterCategory = isAceSpecCard ? 'Ace Spec' : cardCategory;
                const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber);
                const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                    ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}" title="Owned other INT prints: ${otherPrintOwnedCount}x">
                        <span class="city-league-other-print-sparkle-icon"></span>
                        <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                    </div>`
                    : '';
                
                // Coloured usage bar overlay — only in skeleton mode so the
                // flat overview keeps its current visual contract.
                const usagePct = Math.max(0, Math.min(100, rawPercentage || 0));
                // Das Anteilsband: wie viele der ausgewerteten Listen
                // spielen diese Karte. Zwei Aenderungen gegenueber
                // vorher:
                //
                // 1. Es laeuft immer, nicht nur im Skelettmodus. Es ist
                //    die einzige Angabe, die ein Kartengitter lesbar
                //    macht — eine 4-of, die 38 % der Listen spielen, und
                //    eine, die 100 % spielen, sehen sonst gleich aus.
                // 2. Die Farbe kommt aus css/tokens.css statt aus einer
                //    Ampel im Markup. Gruen-Orange-Grau war hart
                //    verdrahtet, in keinem Thema anzufassen, und genau
                //    die Skala, die tokens.css fuer diese Seite
                //    ausgeschlossen hat.
                const usageBucket = usagePct >= SKELETON_MAIN_MIN ? 'main'
                    : usagePct >= SKELETON_NICHE_MAX ? 'option' : 'niche';
                const usageBarHtml = usagePct > 0
                    ? `<div class="card-usage-bar" data-usage="${usageBucket}" title="${
                        Math.round(usagePct)}% ${USAGE_TITLE}"><div class="card-usage-fill" style="width:${
                        usagePct}%;"></div></div>`
                    : '';

                // Pin functionality intentionally omitted in City League's
                // card overview — the per-format deck builder doesn't need a
                // user pin/unpin affordance here (the Generate flow uses the
                // tech-slots system, which lives in the global deck builders).
                cardHtmls.push({ pct: usagePct, isAceSpec: isAceSpecCard, html: `
                    <div class="card-item city-league-card-item" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                        <div class="card-image-container city-league-card-image-container">
                            <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                            ${usageBarHtml}
                            <!-- Red badge: Max Count (top-right) -->
                            <div class="city-league-card-badge city-league-card-badge-max">${finalMaxCount}</div>
                            ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div class="city-league-card-badge city-league-card-badge-deck">${deckCount}</div>` : ''}
                            ${otherPrintSparkleHtml}
                            <!-- Card info section - Mobile Overlay -->
                            <div class="card-info-bottom city-league-card-info-bottom">
                                <div class="card-info-text city-league-card-info-text">
                                    <div class="city-league-card-title-mobile">${cardName}${cardNameWarning}</div>
                                    <div class="city-league-card-set-stats-row"><div class="city-league-card-set-mobile">${setCode} ${setNumber}</div>${resolvedPercentage > 0 ? `<div class="city-league-card-stats-mobile">${percentage}%</div>` : ''}</div>
                                    ${resolvedPercentage > 0 ? `<div class="city-league-card-avg-mobile">Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)</div>` : ''}
                                    <div class="city-league-card-deck-stats-mobile">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</div>
                                </div>
                                <!-- Card Actions: Row 1 = - ★ + | Row 2 = L + Cardmarket -->
                                <div class="card-action-buttons city-league-card-action-buttons">
                                    <div class="city-league-card-action-row">
                                        <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('cityLeague', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                        <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                        <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('cityLeague', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
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
                ` });
                }); // End of versionsToRender.forEach
            }); // End of sortedCards.forEach

            // ── Render path ───────────────────────────────────────────
            // Without skeleton: existing flat batch render (preserved
            // behaviour for "All Archetypes"). With skeleton: split the
            // already-rendered card HTML into Main / Options / Niche
            // sections (no second render pass — same HTML strings).
            const renderGen = ++_cityLeagueRenderGen;
            const BATCH_SIZE = 12;

            if (!useSkeletonLayout) {
                const flatHtmls = cardHtmls.map(c => c.html);
                gridContainer.innerHTML = flatHtmls.slice(0, BATCH_SIZE).join('');
                if (flatHtmls.length > BATCH_SIZE) {
                    let offset = BATCH_SIZE;
                    (function renderNextBatch() {
                        if (renderGen !== _cityLeagueRenderGen) return;
                        if (offset >= flatHtmls.length) return;
                        const batch = flatHtmls.slice(offset, offset + BATCH_SIZE);
                        gridContainer.insertAdjacentHTML('beforeend', batch.join(''));
                        offset += BATCH_SIZE;
                        requestAnimationFrame(renderNextBatch);
                    })();
                }
            } else {
                // Bucket cards by usage % — Main / Options / Niche.
                // Multiple versions of the same card share the same `pct`
                // so they end up in the same bucket together.
                //
                // Ace Spec exception: only one Ace Spec is legal per deck,
                // so the usual %-thresholds don't really apply. Instead
                // the most-played Ace Spec across this archetype's decks
                // counts as Main, the 2nd / 3rd as Options, the rest as
                // Niche — regardless of their absolute %.
                const aceCards = cardHtmls.filter(c => c.isAceSpec);
                const aceSorted = [...aceCards].sort((a, b) => b.pct - a.pct);
                const aceMainSet    = new Set(aceSorted.slice(0, 1));
                const aceOptionsSet = new Set(aceSorted.slice(1, 3));
                // Anything beyond rank 3 falls through to Niche.

                const bucketOf = (c) => {
                    if (c.isAceSpec) {
                        if (aceMainSet.has(c))    return 'main';
                        if (aceOptionsSet.has(c)) return 'options';
                        return 'niche';
                    }
                    if (c.pct >= SKELETON_MAIN_MIN)  return 'main';
                    if (c.pct >= SKELETON_NICHE_MAX) return 'options';
                    return 'niche';
                };

                const mainItems    = cardHtmls.filter(c => bucketOf(c) === 'main');
                const optionsItems = cardHtmls.filter(c => bucketOf(c) === 'options');
                const nicheItems   = cardHtmls.filter(c => bucketOf(c) === 'niche');

                const sectionHtml = (titleHtml, items, opts) => {
                    if (!items.length) return '';
                    const inner = `<div class="card-grid card-grid-condensed deck-grid-skeleton-grid">${items.map(c => c.html).join('')}</div>`;
                    if (opts && opts.collapsible) {
                        // open by default; user can click summary to collapse
                        return `<details class="meta-card-skeleton-section meta-card-skeleton-niche" open>
                            <summary><span class="meta-card-skeleton-title">${titleHtml}</span><span class="meta-card-skeleton-count">${items.length}</span></summary>
                            ${inner}
                        </details>`;
                    }
                    return `<section class="meta-card-skeleton-section">
                        <h3 class="meta-card-skeleton-title">${titleHtml} <span class="meta-card-skeleton-count">${items.length}</span></h3>
                        ${inner}
                    </section>`;
                };

                gridContainer.innerHTML = `<div class="meta-card-skeleton-wrap">
                    ${sectionHtml(`<i class="ds-usage-dot" data-usage="main" aria-hidden="true"></i> ${
                        t('cl.skelMain') || 'Main Cards'} <span class="meta-card-skeleton-hint">${
                        t('cl.skelMainHint') || '(staples + #1 Ace Spec)'}</span>`, mainItems)}
                    ${sectionHtml(`<i class="ds-usage-dot" data-usage="option" aria-hidden="true"></i> ${
                        t('cl.skelOptions') || 'Options'} <span class="meta-card-skeleton-hint">${
                        t('cl.skelOptionsHint') || '(flex slots + Ace Spec #2\u20133)'}</span>`, optionsItems)}
                    ${sectionHtml(`<i class="ds-usage-dot" data-usage="niche" aria-hidden="true"></i> ${
                        t('cl.skelNiche') || 'Situational'} <span class="meta-card-skeleton-hint">${
                        t('cl.skelNicheHint') || '(rare picks \u2014 click to collapse)'}</span>`, nicheItems, { collapsible: true })}
                </div>`;
            }
            if (visualContainer) {
                visualContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                visualContainer.style.display = 'block';
            }
            console.info(`[CityLeague] Rendered ${sortedCards.length} overview cards`);
        }
        
        function filterOverviewCards() {
            const searchInput = document.getElementById('cityLeagueOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('cityLeagueDeckGrid');
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
                // Befund D (30.08.2026): dieser Filter hatte den
                // Pokedex-Zweig GAR NICHT, obwohl der Platzhalter darueber
                // "Name (EN/DE), Set+Nr. oder Pokedex suchen…" verspricht.
                // Gemessen: die drei Nachbarsuchen fanden ueber die
                // Pokedex-Nummer, diese hier 0 Treffer. Die Kachel kennt
                // nur ihren Namen, also faellt der gemeinsame Helfer auf
                // window.pokedexNumbers zurueck (1064 Eintraege).
                // 30.08.2026 nachgemessen: die CSV-Spalte pokedex_number
                // ist NICHT mehr in allen Zeilen leer — in
                // all_cards_merged.csv sind 15.382 von 20.878 gefuellt.
                // Fuer diese Kachel aendert das nichts (sie hat nur den
                // Namen), aber der Satz stimmte nicht mehr.
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

                const matchesType = overviewCardTypeFilter === 'all' || cardType === overviewCardTypeFilter
                    || (overviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.classList.remove('d-none');
                    visibleCount++;
                } else {
                    card.classList.add('d-none');
                }
            });
            
            // Update card count
            const countElement = document.getElementById('cityLeagueCardCount');
            if (countElement) {
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
        
        function setOverviewCardTypeFilter(type) {
            overviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('overviewTypeAll'),
                'Pokemon': document.getElementById('overviewTypePokemon'),
                'Supporter': document.getElementById('overviewTypeSupporter'),
                'Item': document.getElementById('overviewTypeItem'),
                'Tool': document.getElementById('overviewTypeTool'),
                'Stadium': document.getElementById('overviewTypeStadium'),
                'Energy': document.getElementById('overviewTypeEnergy'),
                'Special Energy': document.getElementById('overviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('overviewTypeAceSpec')
            };
            
            // Reset all button styles to match actual markup/CSS classes
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('active');
                }
            });

            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.add('active');
            }
            
            // Apply filter
            filterOverviewCards();
        }
        
        function setCurrentMetaOverviewCardTypeFilter(type) {
            currentMetaOverviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('currentMetaOverviewTypeAll'),
                'Pokemon': document.getElementById('currentMetaOverviewTypePokemon'),
                'Supporter': document.getElementById('currentMetaOverviewTypeSupporter'),
                'Item': document.getElementById('currentMetaOverviewTypeItem'),
                'Tool': document.getElementById('currentMetaOverviewTypeTool'),
                'Stadium': document.getElementById('currentMetaOverviewTypeStadium'),
                'Energy': document.getElementById('currentMetaOverviewTypeEnergy'),
                'Special Energy': document.getElementById('currentMetaOverviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('currentMetaOverviewTypeAceSpec')
            };
            
            // Reset all button styles
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('btn-active', 'btn-inactive');
                    btn.classList.add('btn-inactive');
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.remove('btn-inactive');
                buttons[type].classList.add('btn-active');
            }
            
            // Apply filter
            filterCurrentMetaOverviewCards();
        }
        
        function setPastMetaOverviewCardTypeFilter(type) {
            pastMetaOverviewCardTypeFilter = type;
            
            // Update button styles
            const buttons = {
                'all': document.getElementById('pastMetaOverviewTypeAll'),
                'Pokemon': document.getElementById('pastMetaOverviewTypePokemon'),
                'Supporter': document.getElementById('pastMetaOverviewTypeSupporter'),
                'Item': document.getElementById('pastMetaOverviewTypeItem'),
                'Tool': document.getElementById('pastMetaOverviewTypeTool'),
                'Stadium': document.getElementById('pastMetaOverviewTypeStadium'),
                'Energy': document.getElementById('pastMetaOverviewTypeEnergy'),
                'Special Energy': document.getElementById('pastMetaOverviewTypeSpecialEnergy'),
                'Ace Spec': document.getElementById('pastMetaOverviewTypeAceSpec')
            };
            
            // Reset all button styles
            Object.values(buttons).forEach(btn => {
                if (btn) {
                    btn.classList.remove('btn-active', 'btn-inactive');
                    btn.classList.add('btn-inactive');
                }
            });
            
            // Highlight active button
            if (buttons[type]) {
                buttons[type].classList.remove('btn-inactive');
                buttons[type].classList.add('btn-active');
            }
            
            // Apply filter
            filterPastMetaOverviewCards();
        }
        
        function toggleDeckGridView() {
            const gridViewContainer = document.getElementById('cityLeagueDeckVisual');
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            // Get button from DOM instead of event
            // Alle Umschalter dieser Ansicht, nicht nur der erste: die
            // Beschriftung darf nicht auseinanderlaufen.
            const gridButtons = document.querySelectorAll('button[onclick*="toggleDeckGridView"]');
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('[WARN] Grid or table container not found');
                return;
            }
            
            const cards = window.currentCityLeagueDeckCards;
            if (!cards || cards.length === 0) {
                showToast(t('cl.selectDeckFirst'), 'warning');
                return;
            }
            
            // Check current view mode (grid is default)
            const isGridViewActive = !gridViewContainer.classList.contains('d-none');
            if (isGridViewActive) {
                // Switch to list/table view
                gridViewContainer.classList.add('d-none');
                tableViewContainer.classList.remove('d-none', 'city-league-deck-table-view-hidden');
                // Befund J (30.08.2026): der Umschalter beschriftete sich
                // in beiden Sprachen englisch — die Schluessel gab es
                // laengst, sie wurden nur nicht benutzt.
                // Befund B (30.08.2026): der Zustand wird jetzt am Knopf
                // vermerkt, damit ein spaeterer Sprachwechsel ihn nicht
                // mit dem statischen data-i18n-Wert ueberschreibt.
                gridButtons.forEach(b => window.ansichtsUmschalterBeschriften(b, 'list'));
            } else {
                // Switch back to grid view
                tableViewContainer.classList.add('d-none');
                gridViewContainer.classList.remove('d-none', 'city-league-deck-visual-hidden');
                gridButtons.forEach(b => window.ansichtsUmschalterBeschriften(b, 'grid'));
            }
            
            // Re-apply filter to preserve percentage filter and render correct view
            applyCityLeagueFilter();
            
            // Re-apply current search filter
            filterOverviewCards();
        }
        
        function copyDeckOverview() {
            const deck = window.cityLeagueDeck;
            const hasDeck = deck && Object.keys(deck).length > 0;
            
            const allCards = window.currentCityLeagueDeckCards || [];
            const allCardsFromDb = window.allCardsDatabase || [];
            
            // If no deck AND no archetype cards, show error
            if (!hasDeck && allCards.length === 0) {
                showToast(t('cl.noCopyCards'), 'warning');
                return;
            }
            
            // Build card data maps
            const cardDataByName = {};
            allCards.forEach(card => {
                cardDataByName[card.card_name] = card;
            });
            allCardsFromDb.forEach(card => {
                if (!cardDataByName[card.name]) {
                    cardDataByName[card.name] = {
                        card_name: card.name,
                        type: card.type || 'Unknown',
                        card_type: card.type || 'Unknown',
                        set_code: card.set,
                        set_number: card.number,
                        rarity: card.rarity
                    };
                }
            });
            
            const deckCards = [];
            const globalPref = getGlobalRarityPreference();
            const currentRarityMode = overviewRarityMode || 'min';
            
            if (hasDeck) {
                // COPY USER'S DECK with displayed versions
                devLog('[copyDeckOverview] Copying user deck with', Object.keys(deck).length, 'card types');
                
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (count <= 0) continue;
                    
                    // Extract base name and original set info
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    const baseName = baseNameMatch ? baseNameMatch[1] : deckKey;
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    const originalSet = setMatch ? setMatch[1] : null;
                    const originalNumber = setMatch ? setMatch[2] : null;
                    
                    let cardData = cardDataByName[baseName];
                    if (!cardData) continue;
                    
                    // Clone cardData to avoid modifying original
                    cardData = { ...cardData };
                    
                    // Apply rarity preference to get DISPLAYED version
                    const pref = getRarityPreference(baseName);
                    
                    // PRIORITY 1: Specific user preference
                    if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                        const specificCard = allCardsFromDb.find(c => 
                            c.name === baseName && c.set === pref.set && c.number === pref.number
                        );
                        if (specificCard) {
                            cardData.set_code = specificCard.set;
                            cardData.set_number = specificCard.number;
                        }
                    }
                    // PRIORITY 2: Global rarity preference (min/max)
                    else if (globalPref === 'max' || globalPref === 'min') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    // PRIORITY 3: Use original version from deck key
                    else if (originalSet && originalNumber) {
                        cardData.set_code = originalSet;
                        cardData.set_number = originalNumber;
                    }
                    
                    deckCards.push({
                        ...cardData,
                        count: count
                    });
                }
            } else {
                /* BEFUND (30.08.2026): ohne selbstgebautes Deck nahm diese
                   Schleife `max_count` — die HOECHSTE Kopienzahl ueber alle
                   ausgewerteten Listen. Die Anzeige darueber sagte
                   "33 Karten / 60 Gesamt", in der Zwischenablage landeten
                   **74**. Die Ausgabe traegt PTCGL-Abschnittskoepfe, sieht
                   also aus wie eine Deckliste — sie war keine, sondern ein
                   Kartenpool. Deck-Analyse (Global) hatte denselben Fehler
                   mit 109 statt 60.

                   Wie dort und wie in Vergangenes Meta (seit 29.08.):
                   der Mittelwert ist die repraesentative Kopienzahl,
                   `max_count` nur dort, wo es keinen gibt — bei einer
                   Auswahl aus einer einzigen Liste. Ohne Boden von einer
                   Kopie: der gehoert auf das Kaertchen im Gitter, nicht in
                   eine Deckliste. */
                devLog('[copyDeckOverview] Copying archetype cards, mode:', currentRarityMode);

                const einzelneListe = allCards.length > 0 &&
                    allCards.every(c => (parseInt(c.total_decks_in_archetype || 0, 10) || 0) <= 1);
                const zahl = (v) => {
                    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
                    return isFinite(n) ? n : 0;
                };
                /* Einzeln runden verliert die Summe: die rohen Mittelwerte
                   ergeben in JEDEM Archetyp exakt 60, gerundet aber nur in
                   10 von 60 Faellen — Dragapult 56, Grimmsnarl Froslass 61.
                   Nach groessten Resten verteilen haelt die Summe.
                   Siehe verteileKopienAufDeckgroesse() in js/app-utils.js. */
                const _verteilung = (!einzelneListe
                        && typeof verteileKopienAufDeckgroesse === 'function')
                    ? verteileKopienAufDeckgroesse(allCards, 60, {
                        wert: (c) => c.average_count_overall ?? c.average_count })
                    : null;
                const _kopienNach = new Map();
                if (_verteilung && _verteilung.basis === 'verteilt') {
                    allCards.forEach((c, i) => _kopienNach.set(c, _verteilung.kopien[i]));
                }

                // Process each card from archetype
                allCards.forEach(card => {
                    const cardName = card.card_name;
                    const maxCount = einzelneListe
                        ? (parseInt(card.max_count, 10) || 0)
                        : (_kopienNach.has(card)
                            ? _kopienNach.get(card)
                            : Math.round(zahl(card.average_count_overall ?? card.average_count)));
                    if (maxCount <= 0) return;
                    
                    const originalSet = card.set_code || '';
                    const originalNumber = card.set_number || '';
                    
                    // Clone card data
                    let cardData = { ...card };
                    
                    // Apply rarity mode to get displayed version
                    if (currentRarityMode === 'min' || currentRarityMode === 'max') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(cardName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    // If 'all' mode, we only copy the first version (can be improved later to include all)
                    
                    deckCards.push({
                        card_name: cardName,
                        type: cardData.type || cardData.card_type || 'Unknown',
                        card_type: cardData.type || cardData.card_type || 'Unknown',
                        set_code: cardData.set_code || '',
                        set_number: cardData.set_number || '',
                        count: maxCount
                    });
                });
            }
            
            // Sort cards using the same logic
            const sortedCards = sortCardsByType(deckCards);
            
            // Group by category
            const pokemon = [];
            const trainer = [];
            const energy = [];
            let pokemonCount = 0;
            let trainerCount = 0;
            let energyCount = 0;
            
            sortedCards.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const count = card.count;
                const cardName = card.card_name || '';
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                const line = `${count} ${cardName} ${setCode} ${setNumber}`.trim();
                
                if (category === 'Pokemon') {
                    pokemon.push(line);
                    pokemonCount += count;
                } else if (category === 'Basic Energy' || category === 'Energy' || category === 'Special Energy') {
                    energy.push(line);
                    energyCount += count;
                } else {
                    // Supporter, Item, Tool, Stadium all go to Trainer
                    trainer.push(line);
                    trainerCount += count;
                }
            });
            
            // Build output text
            let output = '';
            
            if (pokemon.length > 0) {
                output += `${t('cl.pokemon')} ${pokemonCount}\n`;
                output += pokemon.join('\n') + '\n\n';
            }
            
            if (trainer.length > 0) {
                output += `${t('cl.trainer')} ${trainerCount}\n`;
                output += trainer.join('\n') + '\n\n';
            }
            
            if (energy.length > 0) {
                output += `${t('cl.energy')} ${energyCount}\n`;
                output += energy.join('\n');
            }
            
            // Copy to clipboard. Ergibt die Liste keine 60 Karten, sagt die
            // Meldung das — siehe denselben Befund in
            // app-current-meta-analysis.js (01.09.2026): eine Erfolgsmeldung
            // ueber einer Liste, die PTCGL ablehnt, schickt den Nutzer auf
            // die falsche Fehlersuche.
            const _gesamt = pokemonCount + trainerCount + energyCount;
            navigator.clipboard.writeText(output).then(() => {
                if (_gesamt === 60) {
                    showToast(t('cl.deckCopied'), 'success');
                } else {
                    showToast(t('cl.deckCopiedIncomplete').replace('{n}', String(_gesamt)),
                        'warning');
                }
            }).catch(err => {
                console.error('Error copying:', err);
                showToast(t('cl.copyError'), 'error');
            });
        }

        // Helper function to safely parse percentage_in_archetype (can be string with comma)
        const parsePct = (val) => parseLocaleNumber(val || "0", 0);

        function renderCityLeagueAnalysisTable(data) {
            devLog('renderCityLeagueAnalysisTable called with', data ? data.length : 0, 'rows');
            const tableContainer = document.getElementById('cityLeagueAnalysisTable');
            if (!tableContainer) {
                console.error('Table container not found!');
                return;
            }
            if (!data || data.length === 0) {
                console.warn('No data to render');
                tableContainer.innerHTML = getEmptyStateBoxHtml({
                    title: t('cl.selectDeckPlaceholder'),
                    description: t('cl.noDataFoundDesc'),
                    icon: 'cards'
                });
                return;
            }

            // Group cards into FOUR tiers: Check Ace Spec FIRST, then by usage percentage
            const coreCards = [];
            const aceSpecCards = [];
            const techCards = [];
            const spicyCards = [];
            
            // Hardcoded Ace Spec names for reliable detection (CSV is_ace_spec is buggy)
            // Was a hardcoded 30-name copy of data/ace_specs.json that had
            // drifted apart from it: 12 names missing (gold potion, max rod,
            // crystal edge, ...) and 3 present that the real list does not
            // contain. A card in either gap rendered in the wrong tier block.
            // Use the central resolver, which reads the loaded list; keep the
            // rarity / rules checks as a fallback for rows whose name the list
            // has not caught up with yet.
            const _isAceSpecCentral = (typeof window.isAceSpec === 'function')
                ? window.isAceSpec
                : () => false;
            // Floor, not a replacement. isAceSpec reads aceSpecsList, which
            // starts empty and is only filled by the data/ace_specs.json
            // fetch; if that fetch fails it returns false for everything and
            // the Ace Spec block silently empties instead of degrading. The
            // rarity / rules checks below are known-unreliable ("CSV
            // is_ace_spec is buggy"), so keep the names that used to work as
            // a last resort. Deliberately NOT the source of truth — it is the
            // drifted list that caused the bug this replaced.
            const _ACE_SPEC_FLOOR = new Set(['prime catcher','unfair stamp','master ball',
                'maximum belt',"hero's cape",'awakening drum','reboot pod','survival brace',
                'grand tree','sparkling crystal','dangerous laser','scoop up cyclone',
                'computer search','dowsing machine','rock guard','life dew','g booster',
                'g scope','legacy energy','secret box','hyper aroma','neo upper energy',
                'scramble switch','deluxe bomb','megaton blower','amulet of hope','poké vital a']);
            data.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const _cn = String(card.card_name || card.name || '').trim().toLowerCase();
                const isAceSpec = _isAceSpecCentral(_cn) || _ACE_SPEC_FLOOR.has(_cn) ||
                                  (card.rarity && card.rarity.toLowerCase().includes('ace spec')) ||
                                  (Array.isArray(card.rules) && card.rules.some(r => r.toUpperCase().includes('ACE SPEC')));
                
                if (isAceSpec) {
                    aceSpecCards.push(card);
                } else {
                    const pct = parsePct(card.percentage_in_archetype);
                    if (pct >= 80) {
                        coreCards.push(card);
                    } else if (pct >= 15) {
                        techCards.push(card);
                    } else {
                        spicyCards.push(card);
                    }
                }
            });
            
            // Sort each tier using PTCG card sorting
            sortCardsPTCG(coreCards);
            sortCardsPTCG(techCards);
            sortCardsPTCG(spicyCards);
            
            // Sort Ace Spec cards by usage percentage (descending - most played first)
            aceSpecCards.sort((a, b) => parsePct(b.percentage_in_archetype) - parsePct(a.percentage_in_archetype));
            
            // Helper function to render a single tier
            const renderTier = (tierCards, tierTitle, tierEmoji) => {
                if (tierCards.length === 0) return '';
                
                let html = `<div class="city-league-tier-block">`;
                html += `<h3 class="city-league-tier-title"><span>${tierEmoji}</span> ${tierTitle}</h3>`;
                html += '<table class="responsive-table"><thead><tr>';
                const thImage = t('cl.thImage');
                const thCardsInDeck = t('cl.thCardsInDeck');
                const thCardName = t('cl.thCardName');
                const thSet = t('cl.thSet');
                const thNumber = t('cl.thNumber');
                const thPctArchetype = t('cl.thPctArchetype');
                const thAvgCount = t('cl.thAvgCountUsed');
                html += `<th class="col-image">${thImage}</th>`;
                html += `<th>${thCardsInDeck}</th>`;
                html += `<th>${thCardName}</th>`;
                html += `<th>${thSet}</th>`;
                html += `<th>${thNumber}</th>`;
                html += `<th>${thPctArchetype}</th>`;
                html += `<th>${thAvgCount}</th>`;
                html += `<th>${t('cl.thAction')}</th>`;
                html += '</tr></thead><tbody>';

                tierCards.forEach(row => {
                    const imageUrl = getBestCardImage(row) || '';
                    const cardName = row.card_name || '';
                    const setCode = row.set_code || '';
                    const setNumber = row.set_number || '';
                    const maxCount = parseInt(row.max_count) || row.max_count || '?';
                    const percentage = parsePct(row.percentage_in_archetype).toFixed(1);
                    const deckCount = row.deck_count || '?';
                    const totalDecks = row.total_decks_in_archetype || '?';
                    const avgCount = parsePct(row.average_count || 0).toFixed(2);
                    
                    // Get current deck count from window.cityLeagueDeck
                    const deck = window.cityLeagueDeck || {};
                    const currentDeckCount = deck[cardName] || 0;
                    
                    html += '<tr>';
                    // Image with green badge if card is in deck
                    html += `<td class="col-image" data-label="${thImage}"><div class="city-league-img-badge-wrap">`;
                    html += `<img src="${imageUrl}" alt="${cardName}" loading="lazy" class="city-league-card-img" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${escapeJsStr(cardName)} (${setCode} ${setNumber})')">`;
                    if (currentDeckCount > 0) {
                        html += `<div class="city-league-img-badge">${currentDeckCount}</div>`;
                    }
                    if (typeof getWishlistBadgeHtml === 'function') html += getWishlistBadgeHtml(cardName, setCode, setNumber);
                    html += `</div></td>`;
                    html += `<td data-label="${thCardsInDeck}"><strong>${currentDeckCount}/${maxCount}</strong></td>`;
                    html += `<td data-label="${thCardName}"><strong>${cardName}</strong></td>`;
                    html += `<td data-label="${thSet}">${setCode}</td>`;
                    html += `<td data-label="${thNumber}">${setNumber}</td>`;
                    html += `<td data-label="${thPctArchetype}"><strong class="city-league-pct">${percentage}%</strong></td>`;
                    html += `<td data-label="${thAvgCount}"><strong class="city-league-avg-count">${avgCount}x</strong></td>`;
                    html += `<td class="city-league-action-btns"><button class="btn btn-primary" onclick="addCardToDeck('cityLeague', '${escapeJsStr(cardName)}')">${t('cl.addBtn')}</button><button class="btn btn-red" onclick="addCardToProxy('${escapeJsStr(cardName)}', '${setCode}', '${setNumber}', 1)">${t('cl.proxy')}</button></td>`;
                    html += '</tr>';
                });

                html += '</tbody></table></div>';
                return html;
            };
            
            // Render all FOUR tiers
            let html = '';
            html += renderTier(coreCards, t('cl.tierCore'), '');
            html += renderTier(aceSpecCards, t('cl.tierAceSpec'), '');
            html += renderTier(techCards, t('cl.tierTech'), '');
            html += renderTier(spicyCards, t('cl.tierSpicy'), '');
            
            if (html === '') {
                html = '<p class="city-league-empty-state">' + t('cl.noCardsFound') + '</p>';
            }
            
            tableContainer.innerHTML = html;
            devLog('Table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
        }
        
        function getCardShareValue(card) {
            if (!card || typeof card !== 'object') return null;
            const candidates = [
                card.percentage_in_archetype,
                card.share,
                card.new_share,
                card.old_share
            ];
            for (const candidate of candidates) {
                // NaN fallback (not 0) so the Number.isFinite check
                // distinguishes "field missing" from "field is 0".
                // 2026-06-11 helper-migration regression — old code was
                // `parseFloat(String(x ?? '').replace(',','.'))` which
                // returned NaN for missing input, letting the loop walk
                // every candidate before returning null. A 0 fallback
                // would short-circuit on the FIRST missing field, which
                // breaks applyShareFilterWithAceSpecBoost's "no share
                // data → return all cards" branch.
                const parsed = parseLocaleNumber(candidate ?? '', NaN);
                if (Number.isFinite(parsed)) return parsed;
            }
            return null;
        }

        function getAceSpecBonusCountForFilter(filterValue) {
            if (filterValue === '90') return 1;
            if (filterValue === '70') return 2;
            if (filterValue === '50') return 3;
            return 0;
        }

        function applyShareFilterWithAceSpecBoost(cards, filterValue) {
            const allCards = Array.isArray(cards) ? cards : [];
            if (filterValue === 'all') return [...allCards];

            const threshold = parseInt(filterValue, 10);
            if (!Number.isFinite(threshold)) return [...allCards];

            const hasShareData = allCards.some(card => Number.isFinite(getCardShareValue(card)));
            if (!hasShareData) return [...allCards];

            const filteredSet = new Set();
            allCards.forEach(card => {
                const share = getCardShareValue(card);
                if (Number.isFinite(share) && share >= threshold) {
                    filteredSet.add(card);
                }
            });

            const aceSpecBonusCount = getAceSpecBonusCountForFilter(filterValue);
            if (aceSpecBonusCount > 0) {
                const aceSpecCandidates = allCards
                    .filter(card => {
                        const cardName = card.card_name || card.full_card_name || card.name || '';
                        return isAceSpec(cardName);
                    })
                    .sort((a, b) => {
                        const shareA = getCardShareValue(a) ?? -1;
                        const shareB = getCardShareValue(b) ?? -1;
                        return shareB - shareA;
                    });

                let addedBonus = 0;
                for (const aceCard of aceSpecCandidates) {
                    if (filteredSet.has(aceCard)) continue;
                    filteredSet.add(aceCard);
                    addedBonus += 1;
                    if (addedBonus >= aceSpecBonusCount) break;
                }
            }

            return allCards.filter(card => filteredSet.has(card));
        }

        function applyCityLeagueFilter() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            const archetype = document.getElementById('cityLeagueDeckSelect')?.value;
            
            if (!filterSelect) {
                console.warn('[CityLeague] cityLeagueFilterSelect not found - card overview cannot be rendered');
                return;
            }
            if (!archetype) {
                console.info('[CityLeague] No archetype selected - skipping card overview render');
                return;
            }
            if (!window.currentCityLeagueDeckCards) {
                console.warn('[CityLeague] No deck cards loaded yet for selected archetype');
                return;
            }
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCityLeagueDeckCards;
            const filteredCards = applyShareFilterWithAceSpecBoost(allCards, filterValue);
            
            devLog(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            // Calculate total card counts (sum of max_count)
            // Siehe mittlereDeckGroesse(): Mittelwerte, nicht max_count.
            const _fT = (typeof mittlereDeckGroesse === 'function')
                ? mittlereDeckGroesse(filteredCards) : { groesse: 0, basis: 'unbekannt' };
            const _aT = (typeof mittlereDeckGroesse === 'function')
                ? mittlereDeckGroesse(allCards) : { groesse: 0, basis: 'unbekannt' };
            const filteredTotal = _fT.basis === 'unbekannt' ? '–' : Math.round(_fT.groesse);
            const allTotal = _aT.basis === 'unbekannt' ? '–' : Math.round(_aT.groesse);
            
            // Update deck visual - check which view is active
            const tableViewContainer = document.getElementById('cityLeagueDeckTableView');
            const gridViewContainer = document.getElementById('cityLeagueDeckVisual');
            const isTableViewActive = tableViewContainer && !tableViewContainer.classList.contains('d-none');
            if (isTableViewActive) {
                renderCityLeagueDeckTable(filteredCards);
            } else {
                renderCityLeagueDeckGrid(filteredCards);
            }

            if (gridViewContainer && !isTableViewActive) {
                gridViewContainer.style.display = 'block';
            }
            if (tableViewContainer && isTableViewActive) {
                tableViewContainer.style.display = 'block';
            }
            
            // Update card counts (unique filtered cards / total cards in deck)
            updateCityLeagueCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCityLeagueCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('cityLeagueCardCount');
            const summaryEl = document.getElementById('cityLeagueCardCountSummary');
            
            if (countEl) {
                countEl.textContent = `${uniqueCount} ${t('cl.cards')}`;
            }
            if (summaryEl) {
                summaryEl.textContent = `/ ${filteredTotal} ${t('cl.total')}`;
            }
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('cityLeagueFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCityLeagueFilter;
            }
        })

        function filterCityLeagueAnalysisCards() {
            const searchTerm = (document.getElementById('cityLeagueCardSearchInput')?.value || '').toLowerCase();
            const rows = document.querySelectorAll('#cityLeagueAnalysisTable table tbody tr');
            let visibleCount = 0;

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                const visible = text.includes(searchTerm);
                row.classList.toggle('d-none', !visible);
                if (visible) visibleCount += 1;
            });

            const countEl = document.getElementById('cityLeagueCardCount');
            if (countEl) {
                countEl.textContent = `${visibleCount} ${t('cl.cards')}`;
            }
        }

        // ── i18n: re-render on language change ──────────────────
        document.addEventListener('languageChanged', () => {
            // Befund A4 (30.08.2026): diese drei Zeilen haengen NICHT an
            // window.cityLeagueLoaded. Der Datumshinweis und die beiden
            // Zaehler stehen auch dann schon da, wenn nur die Analyse
            // geladen ist — und blieben deshalb deutsch stehen.
            _relabelCityLeagueDateRangeHints();
            // Steht die Deck-Ansicht auf "nichts gewaehlt", tragen die
            // beiden Zaehler den Text aus clearCityLeagueDeckView(); der
            // wird sonst nie wieder angefasst ("0 Karten" / "/ 0 Gesamt").
            const statsSec = document.getElementById('cityLeagueStatsSection');
            if (statsSec && statsSec.classList.contains('d-none')
                && typeof resetDeckOverviewCounts === 'function') {
                resetDeckOverviewCounts('cityLeagueCardCount', 'cityLeagueCardCountSummary',
                    '0 ' + t('cl.cards'), '/ 0 ' + t('cl.total'));
            }
            if (window.cityLeagueLoaded) {
                // Re-render the comparison tables if data is available
                if (window.cityLeagueSortedData) {
                    renderCityLeagueTable(window._cityLeagueTournamentCount || 0, window._cityLeagueDateRange || '');
                }
                // Re-populate the deck dropdown
                if (typeof populateCityLeagueDeckSelect === 'function') {
                    populateCityLeagueDeckSelect();
                }
                // Re-render analysis table if a deck is selected
                if (window.currentCityLeagueDeckCards) {
                    renderCityLeagueAnalysisTable(window.currentCityLeagueDeckCards);
                }
                // Re-render deck grid/table if visible
                if (typeof refreshCityLeagueDeckDisplay === 'function') {
                    refreshCityLeagueDeckDisplay();
                }
            }
        });


