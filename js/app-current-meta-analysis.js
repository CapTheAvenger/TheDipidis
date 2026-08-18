// app-current-meta-analysis.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // CURRENT META DECK ANALYSIS - Complete Implementation
        // ========================================================================
        
        // Current Meta Global Variables
        let currentMetaFormatFilter = 'all'; // 'all', 'live', 'play'
        let currentMetaRarityMode = 'min'; // 'min', 'max', 'all'
        let currentMetaGlobalRarityPreference = 'min';
        let currentMetaTournamentStartDate = null; // Date object from settings start_date

        // Global "data window from" filter — when set, ALL tournament-row
        // pipelines (Card Analysis aggregations + Deck Builder consistency
        // scoring + Major-anchor) reject rows with tournament_date earlier
        // than this. Resets on page reload (intentional — the filter is a
        // session-level analytical lens, not a saved preference). Read by
        // app-deck-builder.js via window.currentMetaDateFrom.
        let currentMetaDateFrom = null; // 'YYYY-MM-DD' | null
        if (typeof window !== 'undefined') window.currentMetaDateFrom = null;
        // _currentMetaRenderGen is declared in app-core.js (alongside _cityLeagueRenderGen and _pastMetaRenderGen)

        // Parse "14th March 2026" style dates into Date objects
        function parseEnglishTournamentDate(str) {
            if (!str) return null;
            const d = new Date(String(str).replace(/(\d+)(st|nd|rd|th)/, '$1'));
            return isNaN(d.getTime()) ? null : d;
        }

        // Parse DD.MM.YYYY from settings into Date object
        function parseDDMMYYYY(str) {
            if (!str) return null;
            const parts = String(str).split('.');
            if (parts.length !== 3) return null;
            const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            return isNaN(d.getTime()) ? null : d;
        }

        // Load tournament start date from settings (called once during init)
        async function loadCurrentMetaTournamentStartDate() {
            const paths = [
                './config/current_meta_analysis_settings.json?t=' + Date.now(),
                './current_meta_analysis_settings.json?t=' + Date.now()
            ];
            for (const p of paths) {
                try {
                    const resp = await fetch(p);
                    if (!resp.ok) continue;
                    const settings = await resp.json();
                    const raw = settings?.sources?.tournaments?.start_date;
                    if (raw) {
                        currentMetaTournamentStartDate = parseDDMMYYYY(raw);
                        devLog(`[Current Meta] Tournament start_date from settings: ${raw} → ${currentMetaTournamentStartDate}`);
                        return;
                    }
                } catch (e) { /* ignore */ }
            }
            devLog('[Current Meta] No tournament start_date found in settings');
        }

        // Filter tournament CSV rows to only include tournaments >= start_date
        function filterTournamentRowsByMetaDate(rows) {
            if (!currentMetaTournamentStartDate || !Array.isArray(rows)) return rows;
            const cutoff = currentMetaTournamentStartDate;
            const filtered = rows.filter(row => {
                const d = parseEnglishTournamentDate(row.tournament_date);
                return d && d >= cutoff;
            });
            devLog(`[Current Meta] Tournament date filter: ${rows.length} → ${filtered.length} rows (cutoff: ${cutoff.toISOString().slice(0, 10)})`);
            return filtered;
        }
        
        // Initialize Current Meta Deck from localStorage
        if (!window.currentMetaDeck) {
            window.currentMetaDeck = {};
        }
        if (!window.currentMetaDeckOrder) {
            window.currentMetaDeckOrder = [];
        }

        function normalizeCurrentMetaTournamentArchetypeName(value) {
            return String(value || '')
                .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                .trim();
        }

        function normalizeCurrentMetaArchetypeKey(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/['\u2019\u2018`]s\b/g, '').replace(/['\u2019\u2018`]/g, '')
                .replace(/\bex\b/g, '')
                .replace(/[^a-z0-9\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        /**
         * Strip trailing " ex"/" Ex" from archetype names so that
         * dropdown values (e.g. "Ceruledge Ex") match Limitless data keys ("Ceruledge").
         */
        // Strip the trailing " Ex" / " ex" decoration plus any trailing
        // English-set-code suffix that current_meta_analysis_scraper
        // appends ("Crustle Dri", "Eelektrik Blk", "Slowking Scr") so
        // the resulting label matches the bare names Limitless uses on
        // its decks-overview page ("Crustle", "Eelektrik", "Slowking").
        // Case-preserving — used both for dropdown labels and for h3 /
        // matchup-variable-name lookups against limitless_online_decks.html.
        // Keep the set-code list in sync with normalizeArchetypeForMatch
        // in app-meta-cards.js (and update_sets.FALLBACK_SET_ORDER).
        //
        // Set codes are appended by the scraper when a deck name needs
        // disambiguation per format ("Beedrill CRI" = the Beedrill list
        // that emerged after Crimson Invasion was legal). Stripping
        // these for display turns "Beedrill Ex CRI" → "Beedrill" so the
        // dropdown and tier cards read clean. Each new EN set / JP set
        // that ships needs adding here — missing entries leak the raw
        // set suffix into the UI (the CRI miss is what triggered this).
        function stripExSuffix(name) {
            return String(name || '')
                .replace(/\s+(?:asc|blk|cri|dri|jtg|m3|m4|m5|meg|mee|mep|mew|obf|paf|pal|par|pfl|por|pre|scr|sfa|ssp|svi|sve|svp|tef|twm|wht)$/i, '')
                .replace(/\s+ex$/i, '')
                .trim();
        }

        /**
         * Merge Meta Live (Online) rows from current_meta_card_data.csv
         * with the latest Major snapshot from tournament_cards_data_cards.csv,
         * using additive deck counts.
         *
         * Why an explicit additive merge instead of just summing the two
         * `meta` buckets in current_meta_card_data.csv?
         *   The Meta Play! rows in that CSV are structurally sparse
         *   (Limitless deck-list parser drops most cards — only 4 of
         *   ~33 Prague Cynthia's Garchomp cards survive). Tournament
         *   data gives the full per-deck list of every captured Major
         *   tournament, so we use that side instead.
         *
         * Inputs
         *   onlineRows:        Meta Live rows already filtered to the
         *                      target archetype (post-stale-spelling-dedup).
         *   tournamentRows:    Raw tournament_cards_data rows (full file).
         *   archetype:         Canonical archetype name.
         *
         * Returns: a fresh array of card rows whose deck_count /
         *          total_count / total_decks_in_archetype reflect the
         *          combined Online + Major dataset. Cards present in
         *          one source but not the other still get listed; the
         *          missing-side contribution is simply 0.
         *
         * Skips silently (returns onlineRows unchanged) when there
         * isn't enough Major data (<4 placements) — small samples
         * would just inflate the divisor without adding signal.
         */
        function mergeOnlineMajorAdditive(onlineRows, tournamentRows, archetype) {
            if (!Array.isArray(onlineRows) || !Array.isArray(tournamentRows) || !archetype) {
                return onlineRows;
            }
            if (tournamentRows.length === 0) return onlineRows;

            const stripPriceTag = (s) => String(s || '')
                .replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '')
                .trim();
            const archLower = String(archetype || '').trim().toLowerCase();

            // Restrict to the current meta date window. The 'play' path
            // applies this filter when loading currentMetaTournamentCardsData,
            // but the 'all' path's lazy-load doesn't (line ~1318-1326), so
            // depending on filter-toggle order the cached value could
            // include tournaments outside the meta window. Filter here
            // defensively so the cumulative sum below stays scoped.
            const metaScoped = (typeof filterTournamentRowsByMetaDate === 'function')
                ? filterTournamentRowsByMetaDate(tournamentRows)
                : tournamentRows;

            const archetypeRows = metaScoped.filter(r => {
                const cleaned = stripExSuffix(stripPriceTag(r.archetype || '')).toLowerCase();
                return cleaned && cleaned === archLower;
            });
            if (archetypeRows.length === 0) return onlineRows;

            // Aggregate per-card stats CUMULATIVELY across every Major
            // tournament in the meta window. Previous implementation
            // filtered down to the single latest tournament_date, which
            // produced surprising results for archetypes with sparse
            // recent Major presence: Lucario/Hariyama's latest Major had
            // only 3 decks, the < 4 floor below silently dropped ALL
            // Major contribution, and the "All" filter then matched
            // "Limitless Only" exactly even though the archetype-select
            // dropdown's deck-count column showed 11 Major decks cumulated
            // across multiple tournaments. The 'play' filter already
            // sums across tournaments to compute that 11 — this merge
            // now does the same so "All" actually means
            // Online_cumulative + Major_cumulative.
            //
            // A "bucket" = (tournament_id, price-tagged archetype string).
            // All card rows inside a bucket share the same
            // total_decks_in_archetype value, and prints of the same
            // card inside one bucket share their deck-inclusion (the
            // deck-list snapshot picked one print per slot). So we
            // collapse prints WITHIN a bucket (max for deck_count, sum
            // for total_count), then sum ACROSS buckets for the
            // cumulative Major total.
            const bucketCardsByName = new Map();   // bucketKey → Map(card_lower → per-bucket stats)
            const bucketTotalDecks = new Map();    // bucketKey → total_decks_in_archetype
            archetypeRows.forEach(r => {
                const tournamentKey = String(r.tournament_id || r.tournament_name || '').trim() || '_';
                const tag = String(r.archetype || '').trim();
                const bucketKey = `${tournamentKey}|||${tag}`;
                const archTotal = parseInt(r.total_decks_in_archetype || 0, 10) || 0;
                const prevTotal = bucketTotalDecks.get(bucketKey) || 0;
                if (archTotal > prevTotal) bucketTotalDecks.set(bucketKey, archTotal);

                const cn = String(r.card_name || '').trim().toLowerCase();
                if (!cn) return;
                if (!bucketCardsByName.has(bucketKey)) bucketCardsByName.set(bucketKey, new Map());
                const cardMap = bucketCardsByName.get(bucketKey);
                const dc = parseInt(r.deck_inclusion_count || 0, 10) || 0;
                const tc = parseLocaleNumber(r.total_count || 0, 0);
                const mc = parseInt(r.max_count || 0, 10) || 0;
                if (!cardMap.has(cn)) {
                    cardMap.set(cn, {
                        card_name: r.card_name || '',
                        dc: 0, tc: 0, mc: 0,
                        set_code: r.set_code || '',
                        set_number: r.set_number || '',
                        rarity: r.rarity || '',
                        type: r.type || '',
                        image_url: r.image_url || '',
                        is_ace_spec: r.is_ace_spec || '',
                    });
                }
                const e = cardMap.get(cn);
                // Within a bucket the multiple print rows of one card
                // share their deck base — take max() rather than sum to
                // avoid inflating deck_count by the print-row count.
                if (dc > e.dc) e.dc = dc;
                e.tc += tc;
                if (mc > e.mc) e.mc = mc;
            });

            let majorTotalDecks = 0;
            bucketTotalDecks.forEach(v => { majorTotalDecks += v; });
            // Floor at < 1 (i.e. require at least one Major deck). User
            // report: Ursaluna/Lunatone has only 1 Major deck cumulatively
            // in the meta window, and the previous < 2 floor swallowed
            // the merge so "All" matched "Limitless Only" exactly. 1 Major
            // deck is still mathematically valid additive evidence — the
            // earlier <4 floor in the latest-tournament-only version
            // existed to suppress sparse-tournament noise, which doesn't
            // apply once we sum across the whole meta window.
            if (majorTotalDecks < 1) return onlineRows;

            // Sum per-bucket per-card stats across all buckets.
            const majorAgg = new Map();
            bucketCardsByName.forEach(cardMap => {
                cardMap.forEach((s, cn) => {
                    if (!majorAgg.has(cn)) {
                        majorAgg.set(cn, {
                            card_name: s.card_name,
                            deck_count: 0, total_count: 0, max_count: 0,
                            set_code: s.set_code,
                            set_number: s.set_number,
                            rarity: s.rarity,
                            type: s.type,
                            image_url: s.image_url,
                            is_ace_spec: s.is_ace_spec,
                        });
                    }
                    const e = majorAgg.get(cn);
                    e.deck_count += s.dc;
                    e.total_count += s.tc;
                    e.max_count = Math.max(e.max_count, s.mc);
                });
            });

            // Online total: max(total_decks_in_archetype) across Meta Live rows.
            // Per-source rows all carry the SAME total for one archetype,
            // so max is correct (not sum, which would double-count prints).
            let onlineTotal = 0;
            onlineRows.forEach(card => {
                const meta = (card.meta || '').trim();
                if (meta && meta !== 'Meta Live') return;
                const t = parseInt(card.total_decks_in_archetype || 0, 10) || 0;
                if (t > onlineTotal) onlineTotal = t;
            });
            if (onlineTotal === 0) return onlineRows;
            const combinedTotal = onlineTotal + majorTotalDecks;

            // Group online rows by lower-case card name (multiple prints
            // of the same card share their deck_count / total_count once
            // the row is already stale-dedup'd, but we still aggregate
            // defensively).
            const onlineByName = new Map();
            onlineRows.forEach(card => {
                const cn = String(card.card_name || '').trim().toLowerCase();
                if (!cn) return;
                if (!onlineByName.has(cn)) onlineByName.set(cn, []);
                onlineByName.get(cn).push(card);
            });

            const merged = [];
            const seen = new Set();

            // 1. Process every Online card; add Major contribution when present.
            onlineByName.forEach((rows, cn) => {
                // Per the comment above on the grouping: multi-print rows
                // of the same card share their deck_count / total_count
                // once the upstream stale-dedup has run, so summing them
                // multiplies the metric by the print count. That's the
                // root of the "117 % PFL" display bug. Take max() (any
                // single value works when they're equal; max is safe
                // when they're not). total_count uses max() too because
                // each row already reflects the aggregated total — not
                // per-print fragments.
                let online_dc = 0, online_tc = 0, online_mc = 0;
                const tmpl = rows[0];
                rows.forEach(r => {
                    const dc = parseInt(r.deck_count || r.deck_inclusion_count || 0, 10) || 0;
                    const tc = parseLocaleNumber(r.total_count || 0, 0);
                    if (dc > online_dc) online_dc = dc;
                    if (tc > online_tc) online_tc = tc;
                    online_mc = Math.max(online_mc, parseInt(r.max_count || 0, 10) || 0);
                });
                const major = majorAgg.get(cn);
                const combined_dc = online_dc + (major ? major.deck_count : 0);
                const combined_tc = online_tc + (major ? major.total_count : 0);
                const combined_mc = Math.max(online_mc, major ? major.max_count : 0);
                // Defensive cap — combined_dc shouldn't exceed combinedTotal
                // now that prints are collapsed, but pin it anyway.
                const rawPct = combinedTotal > 0 ? (combined_dc / combinedTotal) * 100 : 0;
                const pct = Math.min(100, Math.max(0, rawPct));
                merged.push({
                    ...tmpl,
                    deck_count: combined_dc,
                    deck_inclusion_count: combined_dc,
                    total_count: combined_tc,
                    max_count: combined_mc,
                    total_decks_in_archetype: combinedTotal,
                    percentage_in_archetype: pct.toFixed(2).replace('.', ','),
                    average_count: combined_dc > 0 ? (combined_tc / combined_dc).toFixed(2).replace('.', ',') : '0',
                    average_count_overall: combinedTotal > 0 ? (combined_tc / combinedTotal).toFixed(2).replace('.', ',') : '0',
                    meta: 'Meta Online+Major',
                    _online_deck_count: online_dc,
                    _major_deck_count: major ? major.deck_count : 0,
                    _online_total: onlineTotal,
                    _major_total: majorTotalDecks,
                });
                seen.add(cn);
            });

            // 2. Add Major-only cards (in Prague but absent from Online aggregate).
            majorAgg.forEach((m, cn) => {
                if (seen.has(cn)) return;
                // Defensive cap — same as the Online+Major branch above.
                // Without it, Major-only cards whose deck_count exceeds the
                // Online-derived combinedTotal render as e.g. 117 % share
                // in the archetype overview (Poké Pad on N's Zoroark was
                // the user-flagged repro).
                const rawPct = combinedTotal > 0 ? (m.deck_count / combinedTotal) * 100 : 0;
                const pct = Math.min(100, Math.max(0, rawPct));
                merged.push({
                    archetype,
                    card_name: m.card_name,
                    card_identifier: `${m.set_code} ${m.set_number}`.trim(),
                    deck_count: m.deck_count,
                    deck_inclusion_count: m.deck_count,
                    total_count: m.total_count,
                    max_count: m.max_count,
                    total_decks_in_archetype: combinedTotal,
                    percentage_in_archetype: pct.toFixed(2).replace('.', ','),
                    average_count: m.deck_count > 0 ? (m.total_count / m.deck_count).toFixed(2).replace('.', ',') : '0',
                    average_count_overall: combinedTotal > 0 ? (m.total_count / combinedTotal).toFixed(2).replace('.', ',') : '0',
                    set_code: m.set_code,
                    set_number: m.set_number,
                    rarity: m.rarity,
                    type: m.type,
                    image_url: m.image_url,
                    is_ace_spec: m.is_ace_spec,
                    meta: 'Meta Online+Major',
                    _online_deck_count: 0,
                    _major_deck_count: m.deck_count,
                    _online_total: onlineTotal,
                    _major_total: majorTotalDecks,
                });
            });

            devLog(`[Current Meta] Online+Major additive merge: online=${onlineByName.size}, major=${majorAgg.size}, merged=${merged.length} | totalDecks ${onlineTotal}+${majorTotalDecks}=${combinedTotal} | majorBuckets=${bucketTotalDecks.size}`);
            return merged;
        }

        // ── Possessive-trainer normalisation ─────────────────────────
        // Mirrors backend/scrapers/current_meta_analysis_scraper._POSSESSIVE_TRAINERS.
        // Limitless source data is inconsistent — sometimes "Cynthia Garchomp Ex",
        // sometimes "Cynthia's Garchomp" — and append_mode in the scraper means
        // both spellings can co-exist in current_meta_card_data.csv after a
        // historical name change. Without this fix the dropdown shows two
        // separate entries for the same physical deck (the screenshot the
        // user reported).
        //
        // Keep this dict in sync with the Python side. Lowercased lookup keys
        // → canonical apostrophe-form output. Adding a new trainer here is
        // safe: if the head word doesn't match, the function is a no-op.
        const _POSSESSIVE_TRAINERS_FRONTEND = {
            rocket: "Rocket's",   rockets: "Rocket's",
            cynthia: "Cynthia's",
            marnie: "Marnie's",
            lillie: "Lillie's",
            erika:  "Erika's",
            ethan:  "Ethan's",
            iono:   "Iono's",
            misty:  "Misty's",
            hop:    "Hop's",
            n:      "N's",        ns: "N's",
            steven: "Steven's",
        };

        // Canonicalises an archetype name so equivalent spellings collapse.
        //   "Cynthia Garchomp Ex"   → "Cynthia's Garchomp"
        //   "Cynthia's Garchomp"    → "Cynthia's Garchomp"
        //   "Rockets Mewtwo"        → "Rocket's Mewtwo"
        //   "Rocket's Mewtwo Por"   → "Rocket's Mewtwo"
        // No-op for archetype names without a known trainer head word.
        function canonicalizeArchetype(name) {
            const stripped = stripExSuffix(name);
            if (!stripped) return stripped;
            const parts = stripped.split(/\s+/);
            const headLower = (parts[0] || '').toLowerCase();
            const canonicalHead = _POSSESSIVE_TRAINERS_FRONTEND[headLower];
            if (!canonicalHead) return stripped;
            return [canonicalHead, ...parts.slice(1)].join(' ').trim();
        }
        
        // Load Current Meta Analysis Data
        async function loadCurrentMetaAnalysis() {
          try {
            devLog('Loading Current Meta Analysis...');
            const deckGrid = document.getElementById('currentMetaDeckGrid');
            if (deckGrid && !deckGrid.innerHTML.trim()) {
                showTableSkeleton(deckGrid, { rows: 6, cols: 4, withImage: true });
            }
            const data = await loadCurrentMetaRowsWithFallback();
            devLog('Loaded data:', data ? `${data.length} rows` : 'null');
            
            // Load tournament start_date from settings for Major Tournament date filtering
            await loadCurrentMetaTournamentStartDate();
            
            // Note: Major Tournament data (tournament_cards_data_cards.csv) is VERY LARGE (50MB+)
            // and will be loaded lazily only when a deck is actually opened in Major Tournament mode.
            
            // Load deck stats (winrates)
            const deckStatsRaw = await loadCSV('limitless_online_decks.csv');
            // Drop zombie entries (share=0 — decks that were played in
            // an earlier window but had no matches in the current
            // snapshot). The CSV keeps them so comparison.csv can
            // still show "exited" trends, but the active-meta table
            // shouldn't clutter its tail with rows that play no role
            // in the current period.
            const deckStats = (deckStatsRaw || []).filter(d => {
                const v = (d.share_numeric != null ? String(d.share_numeric) : (d.share || '0'))
                    .replace(',', '.').replace('%', '').trim();
                const n = parseFloat(v);
                return !isNaN(n) && n > 0;
            });
            if (deckStatsRaw && deckStatsRaw.length !== deckStats.length) {
                devLog(`Filtered ${deckStatsRaw.length - deckStats.length} zombie decks (share=0)`);
            }
            if (deckStats) {
                window.currentMetaDeckStats = deckStats;
                devLog('Loaded deck stats:', deckStats.length, 'decks');
                // Phase 1: render current meta chart
                const chartData = deckStats.map(d => ({
                    archetype: d.deck_name || d.archetype || '',
                    new_count: parseInt(d.total_decks || d.count || d.new_count || 0)
                })).filter(d => d.archetype && d.new_count > 0).sort((a, b) => b.new_count - a.new_count);
                setTimeout(() => renderMetaChart('currentMeta', chartData), 400);
            }
            
            // Load matchup data
            const matchupData = await loadCSV('limitless_online_decks_matchups.csv');
            if (matchupData) {
                window.currentMetaMatchupData = matchupData;
                devLog('Loaded matchup data:', matchupData.length, 'matchups');
            }
            
            if (data && data.length > 0) {
                // Fix card name encoding issues (e.g. PokÃ© → Poké) in-place so
                // all subsequent deck lookups use correctly encoded names.
                healCurrentMetaCardRows(data);
                window.currentMetaAnalysisData = data;
                await populateCurrentMetaDeckSelect(data);
                setCurrentMetaFormatFilter('all'); // Set default filter
                window.currentMetaAnalysisLoaded = true;
                
                // Load meta card analysis for consistency calculations
                devLog('Loading meta card analysis for consistency...');
                loadMetaCardAnalysis('currentMeta');
            } else {
                const content = document.getElementById('currentMetaDeckSelect');
                if (content) {
                    content.innerHTML = '<option value="">Error loading data</option>';
                }
            }
          } catch (error) {
            console.error('[Current Meta Analysis] Error loading:', error);
            const content = document.getElementById('currentMetaDeckSelect');
            if (content) {
                content.innerHTML = '<option value="">Error loading analysis data</option>';
            }
          }
        }
        
        // Fuse two archetypes' pre-aggregated rows into a single virtual
        // archetype for the Card Overview. Weighting is "pool both" — the
        // combined denominator is decksA + decksB, the combined numerator
        // is decks_with_card_A + decks_with_card_B. Each card collapses
        // across prints within an archetype first (so a 4× Boss's Orders
        // entry split across two prints in archetype A doesn't double-
        // count) and then across archetypes. Pure function — returns new
        // row objects shape-compatible with the rest of the rendering
        // pipeline so downstream code (deduplicateCards, stat panels,
        // Deck Builder) keeps working without further changes.
        function _fuseArchetypeRows(rowsA, rowsB) {
            // Take MAX across rows rather than rows[0]. current_meta_card_data.csv
            // is append-only — older scrape runs leave stale rows with smaller
            // total_decks_in_archetype values behind, and rows[0] could land on
            // any of them depending on how the source array was assembled.
            // Repro: Ursaluna/Lunatone had 79 rows at total=20 plus 16 stale
            // rows at total=12 plus 1 Meta-Play row at total=1. rows[0] picked
            // the total=12 stale row, fusion read 12+20=32 instead of 20+20=40.
            // max() is correct because the latest scrape has the largest deck
            // pool (archetypes grow over time; even pruning keeps the rolling
            // window's max representative).
            const maxTotal = (rows) => {
                let m = 0;
                for (const r of (rows || [])) {
                    const t = parseInt(r.total_decks_in_archetype || 0, 10) || 0;
                    if (t > m) m = t;
                }
                return m;
            };
            const totalA = maxTotal(rowsA);
            const totalB = maxTotal(rowsB);
            const totalCombined = totalA + totalB;
            if (totalCombined === 0) return [];

            const normName = (s) => String(s || '').toLowerCase().trim();
            const intP = (v) => parseInt(v || 0, 10) || 0;

            const collapseWithinArchetype = (rows) => {
                const byCard = new Map();
                rows.forEach(row => {
                    const key = normName(row.card_name);
                    if (!key) return;
                    if (!byCard.has(key)) {
                        byCard.set(key, { ...row });
                        return;
                    }
                    const e = byCard.get(key);
                    e.deck_inclusion_count = intP(e.deck_inclusion_count) + intP(row.deck_inclusion_count);
                    e.total_count = intP(e.total_count) + intP(row.total_count);
                    e.max_count = Math.max(intP(e.max_count), intP(row.max_count));
                });
                return byCard;
            };

            const aMap = collapseWithinArchetype(rowsA);
            const bMap = collapseWithinArchetype(rowsB);
            const allKeys = new Set([...aMap.keys(), ...bMap.keys()]);
            const merged = [];

            allKeys.forEach(key => {
                const a = aMap.get(key);
                const b = bMap.get(key);
                const rep = a || b;
                const dwA = a ? intP(a.deck_inclusion_count) : 0;
                const dwB = b ? intP(b.deck_inclusion_count) : 0;
                const dwCombined = dwA + dwB;
                const tcCombined = (a ? intP(a.total_count) : 0) + (b ? intP(b.total_count) : 0);
                const maxCombined = Math.max(
                    a ? intP(a.max_count) : 0,
                    b ? intP(b.max_count) : 0
                );
                const pct = totalCombined > 0 ? Math.min(100, dwCombined / totalCombined * 100) : 0;
                const avgCount = dwCombined > 0 ? (tcCombined / dwCombined) : 0;
                merged.push({
                    ...rep,
                    // Set both `deck_count` and `deck_inclusion_count` to the
                    // combined value. Card-tile rendering reads
                    // `card.deck_count || card.deck_inclusion_count` so if
                    // only the latter is updated the spread of `rep` leaks
                    // the primary archetype's pre-fusion deck_count through
                    // (user-reported: fusion showed "21/52 (100,0%)" — the
                    // 21 came from rep.deck_count after Ursaluna's
                    // per-archetype Major-merge, the 52 was the correct
                    // combined total_decks, and the 100% was the correct
                    // fused percentage; only the numerator was stale).
                    deck_count: dwCombined,
                    deck_inclusion_count: dwCombined,
                    total_count: tcCombined,
                    max_count: maxCombined,
                    average_count: avgCount.toFixed(2),
                    total_decks_in_archetype: totalCombined,
                    percentage_in_archetype: pct.toFixed(2).replace('.', ',')
                });
            });
            return merged;
        }

        // Populate deck select dropdown
        async function populateCurrentMetaDeckSelect(data) {
            const comparisonData = await loadCSV('limitless_online_decks_comparison.csv');
            const comparisonMap = new Map();

            const normalizeRankKey = (value) => String(value || '')
                .toLowerCase()
                .replace(/['’]s\b/g, '')
                .replace(/[^a-z0-9\s-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (comparisonData && comparisonData.length > 0) {
                comparisonData.forEach(row => {
                    if (row.deck_name && row.new_count) {
                        const entry = {
                            count: parseInt(row.new_count || 0, 10),
                            rank: parseInt(row.new_rank || 999, 10)
                        };
                        const exactKey = String(row.deck_name || '').toLowerCase();
                        const normalizedKey = normalizeRankKey(row.deck_name);
                        comparisonMap.set(exactKey, entry);
                        if (normalizedKey) comparisonMap.set(`norm:${normalizedKey}`, entry);
                    }
                });
                devLog('Loaded comparison data for', comparisonMap.size, 'decks');
            }

            // Canonicalise archetype names IN-PLACE before any filtering or
            // deduplication. Both the dropdown-build map (keyed by row.archetype)
            // and the per-deck stat filters (`row.archetype === selectedDeck`)
            // run downstream — they all see the canonical form, so duplicates
            // like "Cynthia Garchomp Ex" + "Cynthia's Garchomp" collapse into
            // one entry. Mutating row.archetype here is safe because data is
            // a fresh array from loadCurrentMetaRowsWithFallback (not shared
            // with other tabs that might rely on the raw form).
            data.forEach(row => {
                if (row && row.archetype) row.archetype = canonicalizeArchetype(row.archetype);
            });

            let filteredData = data;
            if (currentMetaFormatFilter === 'live') {
                filteredData = data.filter(row => row.meta === 'Meta Live');
                devLog(`Filtered archetypes to Limitless only: ${filteredData.length} rows`);
            } else if (currentMetaFormatFilter === 'all') {
                devLog(`Keeping all archetype data: ${filteredData.length} rows`);
            } else if (currentMetaFormatFilter === 'play') {
                filteredData = data.filter(row => row.meta === 'Meta Play!');
                devLog(`Filtered archetypes to Major Tournament only: ${filteredData.length} rows`);

                if (filteredData.length === 0) {
                    if (!window.currentMetaTournamentCardsData) {
                        const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                        window.currentMetaTournamentCardsDataRaw = rawTournament;
                        window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
                    }

                    const tournamentRows = Array.isArray(window.currentMetaTournamentCardsData)
                        ? window.currentMetaTournamentCardsData
                        : [];
                    const perArchetypeTournamentCounts = new Map();

                    tournamentRows.forEach(row => {
                        const rawArchetype = normalizeCurrentMetaTournamentArchetypeName(row.archetype);
                        if (!rawArchetype) return;

                        const tournamentKey = String(row.tournament_id || row.tournament_name || '').trim();
                        if (!tournamentKey) return;

                        const normalizedKey = normalizeCurrentMetaArchetypeKey(rawArchetype) || rawArchetype.toLowerCase();
                        const deckCount = parseInt(row.total_decks_in_archetype || 0, 10) || 0;

                        if (!perArchetypeTournamentCounts.has(normalizedKey)) {
                            perArchetypeTournamentCounts.set(normalizedKey, {
                                name: rawArchetype,
                                tournaments: new Map()
                            });
                        }

                        const archetypeEntry = perArchetypeTournamentCounts.get(normalizedKey);
                        const existingCount = archetypeEntry.tournaments.get(tournamentKey) || 0;
                        if (deckCount > existingCount) {
                            archetypeEntry.tournaments.set(tournamentKey, deckCount);
                        }
                    });

                    filteredData = Array.from(perArchetypeTournamentCounts.values()).map(entry => ({
                        archetype: entry.name,
                        total_decks_in_archetype: Array.from(entry.tournaments.values()).reduce((sum, count) => sum + count, 0),
                        meta: 'Meta Play!'
                    }));

                    devLog(`Built Major Tournament archetype list from tournament CSV: ${filteredData.length} archetypes`);
                }
            }

            devLog(`Building archetype list from ${filteredData.length} rows...`);
            const archetypeMap = new Map();

            filteredData.forEach(row => {
                const archetype = String(row.archetype || '').trim();
                if (!archetype) return;

                if (!archetypeMap.has(archetype)) {
                    const comparisonInfo = comparisonMap.get(archetype.toLowerCase())
                        || comparisonMap.get(`norm:${normalizeRankKey(archetype)}`);
                    const deckCount = currentMetaFormatFilter === 'play'
                        ? parseInt(row.total_decks_in_archetype || 0, 10)
                        : (comparisonInfo ? comparisonInfo.count : parseInt(row.total_decks_in_archetype || 0, 10));
                    const rank = comparisonInfo ? comparisonInfo.rank : 999;

                    archetypeMap.set(archetype, {
                        name: archetype,
                        deckCount,
                        rank,
                        limitlessCount: 0,
                        majorCount: 0
                    });
                }
            });

            archetypeMap.forEach((archetypeInfo, archetypeName) => {
                const archetypeDecks = filteredData.filter(row => row.archetype === archetypeName);

                if (archetypeDecks.length > 0 && archetypeDecks[0].meta) {
                    const liveEntry = archetypeDecks.find(row => row.meta === 'Meta Live');
                    const limitlessCount = liveEntry ? parseInt(liveEntry.total_decks_in_archetype || 0, 10) : 0;

                    const playEntry = archetypeDecks.find(row => row.meta === 'Meta Play!');
                    const majorCount = playEntry ? parseInt(playEntry.total_decks_in_archetype || 0, 10) : 0;

                    archetypeInfo.limitlessCount = limitlessCount;
                    archetypeInfo.majorCount = majorCount;
                }
            });
            
            const archetypeList = Array.from(archetypeMap.values());
            devLog('Found archetypes:', archetypeList.length);
            
            // Sort by rank first (lower rank = higher position), then by deck count descending
            const sortedByMeta = [...archetypeList].sort((a, b) => {
                if (a.rank !== b.rank) {
                    return a.rank - b.rank; // Lower rank number = better position
                }
                return b.deckCount - a.deckCount; // Higher deck count = better
            });
            const top10 = sortedByMeta.slice(0, 10);
            const rest = sortedByMeta.slice(10).sort((a, b) => a.name.localeCompare(b.name));
            
            const select = document.getElementById('currentMetaDeckSelect');
            if (!select) return;
            
            select.innerHTML = `<option value="" data-i18n="currentMeta.selectDeck">${typeof t === 'function' ? t('currentMeta.selectDeck') : '-- Select a Deck --'}</option>`;
            
            if (top10.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'Top 10 Meta Decks';
                top10.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.name;
                    option.textContent = stripExSuffix(deck.name);
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            }
            
            if (rest.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'All Other Decks';
                rest.forEach(deck => {
                    const option = document.createElement('option');
                    option.value = deck.name;
                    option.textContent = stripExSuffix(deck.name);
                    optgroup.appendChild(option);
                });
                select.appendChild(optgroup);
            }
            
            select.onchange = function() {
                const archetype = this.value;
                if (archetype) {
                    loadCurrentMetaDeckData(archetype);
                    if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                        updateDeckDisplay('currentMeta');
                    }
                } else {
                    clearCurrentMetaDeckView();
                }
            };

            // Apply pending navigation selection (from jumpToCardAnalysis
            // or a deep-link like #current-analysis?deck=Dragapult).
            const pendingMeta = String(window.pendingCurrentMetaDeckSelection || '').trim();
            if (pendingMeta) {
                const matchingOption = Array.from(select.options).find(option =>
                    option.value && option.value.toLowerCase() === pendingMeta.toLowerCase()
                );
                if (matchingOption) {
                    select.value = matchingOption.value;
                    // The custom searchable dropdown displays the label in
                    // its own surface element — without syncing it, deep-
                    // links would load data but the dropdown still showed
                    // '-- Select a Deck --' (F-09 from the visual sweep).
                    if (typeof syncSearchableSelectDisplay === 'function') {
                        try { syncSearchableSelectDisplay(select); } catch (_e) { /* tolerate */ }
                    }
                    window.pendingCurrentMetaDeckSelection = null;
                    window.currentMetaArchetype = matchingOption.value;
                    loadCurrentMetaDeckData(matchingOption.value);
                }
            }

            if (!pendingMeta) {
                const savedArchetype = String(window.currentMetaArchetype || '').trim();
                if (savedArchetype) {
                    const savedOption = Array.from(select.options).find(option =>
                        option.value && option.value.toLowerCase() === savedArchetype.toLowerCase()
                    );
                    if (savedOption) {
                        select.value = savedOption.value;
                        loadCurrentMetaDeckData(savedOption.value);
                    }
                }
            }

            if (!select.value) {
                window.currentMetaArchetype = '';
                clearCurrentMetaDeckView();
            }

            // Convert native <select> to custom searchable dropdown
            if (typeof initSearchableSelect === 'function') initSearchableSelect(select);

            // Mirror the same option groups into the Cooking-mode fusion
            // select so users can pair the primary archetype with a second
            // one and see a combined Card Overview. Kept in sync every
            // time the primary list is rebuilt (filter changes etc.).
            const fusionSelect = document.getElementById('currentMetaDeckSelectSecondary');
            if (fusionSelect) {
                // Fuse selection is session-scoped (matches the primary
                // archetype dropdown, which also resets on reload). We
                // keep the choice in `window.currentMetaArchetypeSecondary`
                // for within-session navigation between primaries, but
                // don't persist to localStorage — a new page load starts
                // with no fusion partner picked.
                const savedSecondary = String(window.currentMetaArchetypeSecondary || '').trim();
                fusionSelect.innerHTML = `<option value="">${typeof t === 'function' ? t('cm.fuseNone') : '-- None (single deck) --'}</option>`;
                if (top10.length > 0) {
                    const og = document.createElement('optgroup');
                    og.label = 'Top 10 Meta Decks';
                    top10.forEach(deck => {
                        const o = document.createElement('option');
                        o.value = deck.name;
                        o.textContent = stripExSuffix(deck.name);
                        og.appendChild(o);
                    });
                    fusionSelect.appendChild(og);
                }
                if (rest.length > 0) {
                    const og = document.createElement('optgroup');
                    og.label = 'All Other Decks';
                    rest.forEach(deck => {
                        const o = document.createElement('option');
                        o.value = deck.name;
                        o.textContent = stripExSuffix(deck.name);
                        og.appendChild(o);
                    });
                    fusionSelect.appendChild(og);
                }
                if (savedSecondary) {
                    const match = Array.from(fusionSelect.options).find(o => o.value && o.value.toLowerCase() === savedSecondary.toLowerCase());
                    if (match) fusionSelect.value = match.value;
                }
                fusionSelect.onchange = function() {
                    const primary = String(window.currentMetaArchetype || '').trim();
                    const secondary = String(this.value || '').trim();
                    if (secondary && primary && secondary.toLowerCase() === primary.toLowerCase()) {
                        showToast(t('cm.fusionSamePicked') || 'Fusion partner can\'t be the same archetype as the primary.', 'warning');
                        this.value = '';
                        window.currentMetaArchetypeSecondary = '';
                    } else {
                        window.currentMetaArchetypeSecondary = secondary;
                    }
                    _applyCurrentMetaFusionStateClass();
                    if (primary) loadCurrentMetaDeckData(primary);
                };
                if (typeof initSearchableSelect === 'function') initSearchableSelect(fusionSelect);
                _applyCurrentMetaFusionStateClass();
            }
        }

        // Toggle a CSS hook on #current-analysis when a fusion partner is set
        // so the existing deep-dive sections that don't make sense for a
        // hypothetical merged deck (stats / matchups / User-vs-Vanilla /
        // Tech vs Normal / Meta Card Analysis) hide automatically.
        function _applyCurrentMetaFusionStateClass() {
            const container = document.getElementById('current-analysis');
            if (!container) return;
            const active = !!(window.currentMetaArchetypeSecondary && String(window.currentMetaArchetypeSecondary).trim());
            container.setAttribute('data-cm-fusion', active ? 'active' : 'inactive');
        }
        if (typeof window !== 'undefined') {
            window._applyCurrentMetaFusionStateClass = _applyCurrentMetaFusionStateClass;
        }
        
        // Format filter functions
        async function setCurrentMetaFormatFilter(format) {
            currentMetaFormatFilter = format;
            devLog('[Current Meta] Format filter set to:', format);
            
            // Update button styles via classList toggle (className= would
            // wipe the .current-meta-format-btn class that owns the filter
            // pill styling — bug from earlier where active vs inactive
            // looked nearly identical because the format-btn class was
            // gone). Toggle .active so .current-meta-format-btn.active
            // CSS takes effect.
            ['All', 'Live', 'Play'].forEach(f => {
                const btn = document.getElementById(`currentMetaFilter${f}`);
                if (!btn) return;
                const isActive = f.toLowerCase() === format;
                btn.classList.add('current-meta-format-btn');
                btn.classList.toggle('active', isActive);
                btn.classList.remove('btn-secondary'); // legacy class — drop
                btn.classList.toggle('btn-primary', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
                btn.disabled = false;
                btn.title = '';
            });
            
            // Update status text
            const statusEl = document.getElementById('currentMetaFilterStatus');
            if (statusEl) {
                const labels = {
                    'all': typeof t === 'function' ? t('currentMeta.allTournaments') : 'All Tournaments',
                    'live': typeof t === 'function' ? t('currentMeta.limitlessOnly') : 'Limitless Decks Only',
                    'play': typeof t === 'function' ? t('currentMeta.majorOnly') : 'Major Tournament Decks Only'
                };
                const filterLabel = typeof t === 'function' ? t('currentMeta.activeFilter') : 'Active filter:';
                statusEl.textContent = `${filterLabel} ${labels[format]}`;
            }
            
            // Refresh dropdown list to show only archetypes matching the filter
            const currentMetaDeckSelect = document.getElementById('currentMetaDeckSelect');
            const previouslySelected = currentMetaDeckSelect ? currentMetaDeckSelect.value : null;

            const dataToUse = window.currentMetaAnalysisData;

            if (dataToUse) {
                await populateCurrentMetaDeckSelect(dataToUse);
            }
            
            // Respect value already set by populateCurrentMetaDeckSelect (pending selection)
            const currentValue = currentMetaDeckSelect ? currentMetaDeckSelect.value : '';
            if (!currentValue && previouslySelected && currentMetaDeckSelect) {
                const stillExists = Array.from(currentMetaDeckSelect.options).some(opt => opt.value === previouslySelected);
                
                if (stillExists) {
                    currentMetaDeckSelect.value = previouslySelected;
                    if (typeof syncSearchableSelectDisplay === 'function') syncSearchableSelectDisplay(currentMetaDeckSelect);
                    loadCurrentMetaDeckData(previouslySelected);
                } else {
                    currentMetaDeckSelect.value = '';
                    clearCurrentMetaDeckView();
                }
            } else {
                console.warn('No deck selected - filter saved for when deck is selected');
            }
        }

        // Data-window date filter — surfaced via the date picker next to
        // the format filter. Setting a date narrows ALL tournament-row
        // pipelines (Card Analysis aggregations + Deck Builder consistency
        // scoring + Major-anchor) to rows with tournament_date >= dateStr.
        // Clearing returns to the full data window.
        function _renderCurrentMetaDateStatus() {
            const statusEl = document.getElementById('currentMetaDateStatus');
            const inputEl = document.getElementById('currentMetaDateFrom');
            const clearBtn = document.getElementById('currentMetaDateClear');
            if (inputEl) inputEl.value = currentMetaDateFrom || '';
            if (statusEl) {
                statusEl.textContent = currentMetaDateFrom
                    ? `Active window: data ≥ ${currentMetaDateFrom}`
                    : '';
            }
            if (clearBtn) clearBtn.style.display = currentMetaDateFrom ? '' : 'none';
        }

        async function setCurrentMetaDateFrom(dateStr) {
            const valid = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
            currentMetaDateFrom = valid ? dateStr : null;
            if (typeof window !== 'undefined') window.currentMetaDateFrom = currentMetaDateFrom;
            // Drop the dated-aggregate cache so the next deck-data load
            // re-runs with the new window. Raw rows stay cached on
            // window._datedTournamentRowsRaw.
            if (typeof window !== 'undefined') {
                window._currentMetaDatedAggregateCache = null;
            }
            _renderCurrentMetaDateStatus();
            if (typeof devLog === 'function') devLog('[Current Meta] Date window set to:', currentMetaDateFrom || '(cleared)');

            // Re-render the current archetype so the user sees the filter
            // take effect immediately.
            const sel = document.getElementById('currentMetaDeckSelect');
            if (sel && sel.value) {
                await loadCurrentMetaDeckData(sel.value);
            }
            // Re-run Meta Call's predictor with the new filter so the
            // Day-2 / Geheimtipps lists reflect the same data window the
            // user sees here. Fires only when Meta Call has already been
            // initialised (no-op on a fresh page load before the user
            // visits the Meta Call tab — the next loadData() pass picks
            // up the cutoff via window.currentMetaDateFrom anyway).
            if (typeof window !== 'undefined' && typeof window.metaCallApplyDateFilter === 'function') {
                try { await window.metaCallApplyDateFilter(); } catch (e) {
                    if (typeof devLog === 'function') devLog('[Current Meta] Meta Call refresh failed:', e);
                }
            }
        }

        async function clearCurrentMetaDateFrom() {
            await setCurrentMetaDateFrom('');
        }

        if (typeof window !== 'undefined') {
            window.setCurrentMetaDateFrom = setCurrentMetaDateFrom;
            window.clearCurrentMetaDateFrom = clearCurrentMetaDateFrom;
            // Restore status display on load (input value is auto-restored
            // from the persisted state; the badge needs a manual paint).
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _renderCurrentMetaDateStatus);
            } else {
                _renderCurrentMetaDateStatus();
            }
        }

        // Vanilla vs Deep Dive: split the Current Meta Analysis tab into a
        // beginner-friendly mode (only Card Overview + Deck Builder visible)
        // and a Deep Dive that surfaces every advanced section.
        // Session-scoped: every page reload resets to 'vanilla' so the
        // user always lands on the simpler Overview by default. Toggling
        // mid-session is kept in the DOM attribute only.

        function setCurrentMetaViewMode(mode) {
            const next = mode === 'deepDive' ? 'deepDive' : 'vanilla';
            const container = document.getElementById('current-analysis');
            const prev = container ? container.getAttribute('data-cm-view') : null;
            if (container) container.setAttribute('data-cm-view', next);
            const vanillaBtn = document.getElementById('cmViewModeVanillaBtn');
            const deepBtn    = document.getElementById('cmViewModeDeepDiveBtn');
            if (vanillaBtn) {
                vanillaBtn.classList.toggle('is-active', next === 'vanilla');
                vanillaBtn.setAttribute('aria-selected', String(next === 'vanilla'));
            }
            if (deepBtn) {
                deepBtn.classList.toggle('is-active', next === 'deepDive');
                deepBtn.setAttribute('aria-selected', String(next === 'deepDive'));
            }

            // Re-render the Card Overview when toggling crosses the fusion
            // visibility line — vanilla suppresses fusion (see fusionActive
            // gate in loadCurrentMetaDeckData), so the on-screen cards
            // change between the two modes if a fusion partner is set.
            if (prev && prev !== next) {
                const secondary = String(window.currentMetaArchetypeSecondary || '').trim();
                const primary = String(window.currentMetaArchetype || '').trim();
                if (secondary && primary && typeof loadCurrentMetaDeckData === 'function') {
                    loadCurrentMetaDeckData(primary);
                }
            }
        }

        function _initCurrentMetaViewMode() {
            // Always start in vanilla (Overview) on a fresh page load —
            // matches the primary-archetype + fusion-partner reset
            // behaviour so the Deck Analysis (Global) tab is fully
            // session-scoped.
            setCurrentMetaViewMode('vanilla');
        }

        if (typeof window !== 'undefined') {
            window.setCurrentMetaViewMode = setCurrentMetaViewMode;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _initCurrentMetaViewMode);
            } else {
                _initCurrentMetaViewMode();
            }
        }

        // Pure helper — given an array of rows with a `tournament_date`
        // field (any format _parseAnyTournamentDate handles) and a
        // YYYY-MM-DD cutoff, return only rows on or after the cutoff.
        // Returns the original array unchanged when cutoff is empty/invalid
        // so callers can wrap unconditionally without a no-op branch.
        function filterRowsByDateFrom(rows, cutoffISO) {
            if (!Array.isArray(rows) || rows.length === 0) return rows;
            if (!cutoffISO || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffISO)) return rows;
            const cutoffMs = Date.parse(cutoffISO + 'T00:00:00Z');
            if (!Number.isFinite(cutoffMs)) return rows;
            const parser = (typeof _parseAnyTournamentDate === 'function')
                ? _parseAnyTournamentDate
                : (typeof window !== 'undefined' && typeof window._parseAnyTournamentDate === 'function')
                    ? window._parseAnyTournamentDate
                    : ((s) => { const d = new Date(String(s || '')); return isNaN(d.getTime()) ? null : d; });
            return rows.filter(r => {
                const raw = r && (r.tournament_date || r.date || '');
                if (!raw) return false;
                const d = parser(raw);
                if (!d) return false;
                return d.getTime() >= cutoffMs;
            });
        }
        if (typeof window !== 'undefined') window.filterRowsByDateFrom = filterRowsByDateFrom;

        // Re-aggregate per-tournament rows (online_tournament_dated_cards.csv)
        // by archetype so the result is shape-compatible with
        // current_meta_card_data.csv (the pre-aggregated source the All /
        // Limitless views render from). Used when the user sets a data-
        // window-from date — the pre-aggregate has no per-row dates, so
        // the only way to make the filter actually affect the All view
        // is to re-aggregate from a date-tagged source.
        //
        // Output rows match the column shape consumed by
        // loadCurrentMetaDeckData / Card Overview rendering:
        //   archetype, card_name, card_identifier, total_count, max_count,
        //   deck_inclusion_count, average_count, total_decks_in_archetype,
        //   percentage_in_archetype, set_code, set_number, rarity, type,
        //   image_url, is_ace_spec, meta
        function _aggregateDatedRowsByArchetype(rows) {
            const archetypeBuckets = new Map(); // arch → Set<tid|arch>
            // Two-stage aggregation: first collapse multi-print rows
            // within each (tournament, archetype, card_name) — different
            // set prints of the same card share their deck base in this
            // CSV (each print row's deck_inclusion_count reflects the
            // same set of source decks). Summing across prints would
            // multiply the unique-deck count by the print count, which
            // is exactly what produced "Poké Pad 117 % PFL" (4 prints
            // × ~29 %). max() approximates the deck-union correctly,
            // while total_count is still summed because different prints
            // legitimately contribute different copies to a single deck.
            const perTournamentCard = new Map(); // tid|arch|card → entry
            for (const r of rows) {
                if (!r) continue;
                const arch = String(r.archetype || '').trim();
                const card = String(r.card_name || '').trim();
                const tid  = String(r.tournament_id || '').trim();
                if (!arch || !card || !tid) continue;
                const archDecks = archetypeBuckets.get(arch) || new Set();
                archDecks.add(`${tid}|${arch}`);
                archetypeBuckets.set(arch, archDecks);
                const tcKey = `${tid}|${arch}|${card}`;
                let tc = perTournamentCard.get(tcKey);
                if (!tc) {
                    tc = {
                        archetype: arch,
                        card_name: card,
                        deck_inclusion_count: 0,
                        total_count: 0,
                        max_count: 0,
                        _tmpl: r,
                    };
                    perTournamentCard.set(tcKey, tc);
                }
                const dc = parseInt(r.deck_inclusion_count || 0, 10) || 0;
                if (dc > tc.deck_inclusion_count) tc.deck_inclusion_count = dc;
                tc.total_count += parseLocaleNumber(r.total_count || 0, 0);
                const m = parseInt(r.max_count || 0, 10) || 0;
                if (m > tc.max_count) tc.max_count = m;
            }
            // Second stage: sum the per-tournament-max values across all
            // tournaments inside one (archetype, card_name) bucket.
            const cardData = new Map();         // arch|card → entry
            for (const tc of perTournamentCard.values()) {
                const key = `${tc.archetype}|${tc.card_name}`;
                let entry = cardData.get(key);
                if (!entry) {
                    entry = {
                        archetype: tc.archetype,
                        card_name: tc.card_name,
                        card_identifier: tc._tmpl.card_identifier || '',
                        total_count: 0,
                        max_count: 0,
                        deck_inclusion_count: 0,
                        set_code: tc._tmpl.set_code || '',
                        set_number: tc._tmpl.set_number || '',
                        rarity: tc._tmpl.rarity || '',
                        type: tc._tmpl.type || '',
                        image_url: tc._tmpl.image_url || '',
                        is_ace_spec: tc._tmpl.is_ace_spec || '',
                        meta: 'Meta Live (Dated)',
                    };
                    cardData.set(key, entry);
                }
                entry.deck_inclusion_count += tc.deck_inclusion_count;
                entry.total_count          += tc.total_count;
                if (tc.max_count > entry.max_count) entry.max_count = tc.max_count;
            }
            const out = [];
            for (const entry of cardData.values()) {
                const totalDecks = (archetypeBuckets.get(entry.archetype) || new Set()).size;
                // Defensive cap: should be ≤ 100 now that prints are
                // collapsed correctly, but pin it just in case the data
                // shape changes upstream.
                const rawPct = totalDecks > 0 ? (entry.deck_inclusion_count / totalDecks) * 100 : 0;
                const pct = Math.min(100, Math.max(0, rawPct));
                const avg = entry.deck_inclusion_count > 0 ? entry.total_count / entry.deck_inclusion_count : 0;
                out.push({
                    ...entry,
                    total_decks_in_archetype: totalDecks,
                    percentage_in_archetype: pct.toFixed(1).replace('.', ','),
                    average_count: avg.toFixed(2).replace('.', ','),
                    average_count_overall: (totalDecks > 0 ? entry.total_count / totalDecks : 0).toFixed(2).replace('.', ','),
                });
            }
            return out;
        }
        if (typeof window !== 'undefined') window._aggregateDatedRowsByArchetype = _aggregateDatedRowsByArchetype;

        // Lazy-load + cache the dated-aggregate. Returns null when the
        // raw dated CSV is unavailable. Cached at consume-time on
        // window._currentMetaDatedAggregateCache; invalidated when the
        // user changes the date filter.
        async function _getCurrentMetaDatedAggregate() {
            if (!currentMetaDateFrom) return null;
            if (typeof window !== 'undefined' && window._currentMetaDatedAggregateCache) {
                return window._currentMetaDatedAggregateCache;
            }
            if (typeof loadCSV !== 'function') return null;
            let raw = (typeof window !== 'undefined') ? window._datedTournamentRowsRaw : null;
            if (!raw) {
                try {
                    raw = await loadCSV('online_tournament_dated_cards.csv');
                    // W3 Phase 0 — load all rows, no drop-filter.
                    // Attendance weighting moves to Phase 1.
                    if (typeof window !== 'undefined') window._datedTournamentRowsRaw = raw || [];
                } catch (e) {
                    if (typeof devLog === 'function') devLog('[Current Meta] Dated rows load failed:', e);
                    return null;
                }
            }
            if (!Array.isArray(raw) || raw.length === 0) return null;
            const filtered = filterRowsByDateFrom(raw, currentMetaDateFrom);
            const agg = _aggregateDatedRowsByArchetype(filtered);
            if (typeof window !== 'undefined') window._currentMetaDatedAggregateCache = agg;
            if (typeof devLog === 'function') {
                devLog(`[Current Meta] Dated aggregate: ${filtered.length} rows → ${agg.length} (cutoff ${currentMetaDateFrom})`);
            }
            return agg;
        }

        // Load deck data with format filtering
        async function loadCurrentMetaDeckData(archetype) {
            // First user interaction with this tab — hide the empty-state guidance
            // shown by default. The empty state stays in the DOM so it can flash
            // back if the deck-select is reset to "" (handled below at the
            // empty-archetype guard).
            const emptyState = document.getElementById('currentAnalysisEmptyState');
            if (emptyState) emptyState.classList.add('display-none');

            // The archetype card sits right under the dropdown: after
            // arriving here from a tier-list click, the first thing you
            // want confirmed is that you landed on the right deck. Tiles
            // only — the matchups ARE the rest of this tab.
            const arcHost = document.getElementById('currentMetaArchetypeCard');
            if (arcHost) {
                if (archetype && typeof window.renderArchetypeCardInto === 'function') {
                    arcHost.classList.remove('d-none');
                    window.renderArchetypeCardInto(arcHost, archetype).catch(() => {
                        arcHost.classList.add('d-none');
                    });
                } else {
                    arcHost.classList.add('d-none');
                }
            }

            if (!archetype) {
                if (emptyState) emptyState.classList.remove('display-none');
                // Also hide the Quick Reference panel when the user clears
                // the selection — without this the panel sticks around
                // showing the previous archetype's lists.
                if (typeof renderCurrentMetaQuickRef === 'function') {
                    renderCurrentMetaQuickRef('').catch(() => {});
                }
                return;
            }

            // CRITICAL: Use different data sources based on filter to ensure correct numbers:
            // - 'play' (Major Tournament Decks): tournament_cards_data_cards.csv (Top 256 only, ~31 cards for Alakazam)
            // - 'live' (Limitless Decks): current_meta_card_data.csv with Meta Live rows (~47 cards)
            // - 'all': current_meta_card_data.csv with all rows (~85 cards)

            let data = null;
            let needsAggregation = false;
            
            if (currentMetaFormatFilter === 'play') {
                // Use Major Tournament data (Top 256 only), filtered to current meta period
                if (!window.currentMetaTournamentCardsData) {
                    showToast('Lade Major-Tournament-Kartendaten...', 'info');
                    const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                    window.currentMetaTournamentCardsDataRaw = rawTournament;
                    window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
                }
                data = window.currentMetaTournamentCardsData;
                // Apply user-selected data-window cutoff on top of the
                // meta-period filter — narrows the Card Analysis tables
                // to rows on or after the chosen date.
                if (currentMetaDateFrom && Array.isArray(data) && data.length > 0) {
                    const beforeN = data.length;
                    data = filterRowsByDateFrom(data, currentMetaDateFrom);
                    if (typeof devLog === 'function') {
                        devLog(`[Current Meta][DateWindow] Major rows ${beforeN} → ${data.length} (cutoff ${currentMetaDateFrom})`);
                    }
                }
                needsAggregation = true;
            } else {
                // Use current meta (Limitless) data with optional format filtering.
                // When a data-window date is active, swap to the dated-
                // aggregate path: the pre-aggregated current_meta_card_data.csv
                // has no per-row dates, so the only way to make the filter
                // actually narrow the All / Limitless view is to re-aggregate
                // online_tournament_dated_cards.csv at runtime.
                if (currentMetaDateFrom) {
                    const dated = await _getCurrentMetaDatedAggregate();
                    if (dated && dated.length > 0) {
                        data = dated;
                        if (typeof devLog === 'function') {
                            devLog(`[Current Meta][DateWindow] Limitless view → dated aggregate (${dated.length} rows, cutoff ${currentMetaDateFrom})`);
                        }
                    } else {
                        // Fallback: dated source unavailable, keep aggregate.
                        data = window.currentMetaAnalysisData;
                    }
                } else {
                    data = window.currentMetaAnalysisData;
                }
                needsAggregation = false;
            }
            
            if (!data) {
                console.error('[loadCurrentMetaDeckData] No data available for filter:', currentMetaFormatFilter);
                clearCurrentMetaDeckView();
                return;
            }
            
            window.currentMetaArchetype = archetype;

            // Quick Reference Lists (Feature B) — fire-and-forget so
            // the heavy data loads (per-decklist CSV via the consistency
            // builder + online dated_cards CSV) happen in parallel with
            // the main deck-view aggregation below. Each panel renders
            // its own loading state and resolves independently.
            if (typeof renderCurrentMetaQuickRef === 'function') {
                renderCurrentMetaQuickRef(archetype).catch(err => {
                    console.warn('[Current Meta] QuickRef render failed:', err);
                });
            }

            // Check if we have a saved deck for this archetype
            const savedDeck = localStorage.getItem('currentMetaDeck');
            if (savedDeck) {
                try {
                    const parsed = JSON.parse(savedDeck);
                    if (parsed.archetype !== archetype) {
                        // Different archetype - CLEAR old deck
                        window.currentMetaDeck = {};
                        window.currentMetaDeckOrder = [];
                        saveCurrentMetaDeck();
                    }
                } catch (e) {
                    console.error('[loadCurrentMetaDeckData] Error reading saved deck:', e);
                }
            }
            
            // Filter by archetype. When a Cooking-mode fusion partner is
            // set, partition the rows into primary / secondary buckets so
            // _fuseArchetypeRows can pool them into one virtual archetype
            // downstream. Same-archetype-twice was already blocked at the
            // onchange handler, but we double-check here so a stale state
            // can't crash the merge. Also gated on Cooking view-mode: a
            // saved fusion from a previous session shouldn't silently
            // alter the Quick-Overview card list when the user can't see
            // the partner dropdown to disable it.
            const secondaryArchRaw = String(window.currentMetaArchetypeSecondary || '').trim();
            const cmViewMode = (document.getElementById('current-analysis') || {}).getAttribute
                ? document.getElementById('current-analysis').getAttribute('data-cm-view')
                : null;
            const isCookingMode = cmViewMode === 'deepDive';
            const fusionActive = isCookingMode && !!secondaryArchRaw && secondaryArchRaw.toLowerCase() !== archetype.toLowerCase();
            const normalizedTarget = normalizeCurrentMetaArchetypeKey(archetype);
            const normalizedFusion = fusionActive ? normalizeCurrentMetaArchetypeKey(secondaryArchRaw) : null;

            const matchesArch = (rowArchetype, targetRaw, targetNorm) => {
                if (!rowArchetype) return false;
                if (rowArchetype.toLowerCase() === targetRaw.toLowerCase()) return true;
                const normalizedRow = normalizeCurrentMetaArchetypeKey(rowArchetype);
                return normalizedRow && normalizedRow === targetNorm;
            };

            let primaryRows = [];
            let secondaryRows = [];
            data.forEach(row => {
                const rowArchetype = currentMetaFormatFilter === 'play'
                    ? normalizeCurrentMetaTournamentArchetypeName(row.archetype)
                    : String(row.archetype || '').trim();
                if (matchesArch(rowArchetype, archetype, normalizedTarget)) {
                    primaryRows.push(row);
                } else if (fusionActive && matchesArch(rowArchetype, secondaryArchRaw, normalizedFusion)) {
                    secondaryRows.push(row);
                }
            });

            // Apply format filter only when using current_meta data with 'live' or 'all'
            // (tournament_cards_data is already filtered to Top 256, should NOT be filtered further by meta)
            if (currentMetaFormatFilter === 'live' && !needsAggregation) {
                primaryRows = primaryRows.filter(row => row.meta === 'Meta Live');
                secondaryRows = secondaryRows.filter(row => row.meta === 'Meta Live');
            }

            // Combining primary + secondary is deferred to the setTimeout
            // block below. Order matters for the 'All' filter: each
            // archetype needs its own mergeOnlineMajorAdditive pass against
            // tournament_cards_data BEFORE we collapse the two pools into
            // one virtual archetype — otherwise the fusion totals miss the
            // Major slice entirely (user-reported: 20 Limitless + 1 Major
            // Ursaluna × 20 Limitless + 11 Major Lucario should fuse to a
            // 21+31=52-deck pool, but skipping the per-archetype Major
            // merge gave us 20+20=40 at best, or 12+20=32 with stale rows).
            let deckCards;

            if (primaryRows.length === 0 && (!fusionActive || secondaryRows.length === 0)) {
                showToast(`No data found for ${archetype} with filter "${currentMetaFormatFilter}"!`, 'warning');
                clearCurrentMetaDeckView();
                return;
            }

            // Pre-load tournament_cards_data when the user is on the
            // 'Online + Major' filter — the additive merge inside the
            // setTimeout block needs it synchronously, and pre-loading
            // here keeps the merge logic simple. Cached after first load.
            if (currentMetaFormatFilter === 'all' && !window.currentMetaTournamentCardsData) {
                try {
                    const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                    if (rawTournament && rawTournament.length) {
                        window.currentMetaTournamentCardsDataRaw = rawTournament;
                        window.currentMetaTournamentCardsData = rawTournament;
                    }
                } catch (e) {
                    devLog('[Current Meta] Could not load tournament data for Online+Major merge:', e);
                }
            }

            // Show loading indicator for aggregation work
            const _earlyTotalRowEstimate = primaryRows.length + secondaryRows.length;
            if (needsAggregation && _earlyTotalRowEstimate > 100) {
                showToast(`Processing ${_earlyTotalRowEstimate} card entries... This may take a moment`, 'info');
            }

            // Use setTimeout to allow UI to update and prevent complete freezing
            setTimeout(() => {
                // Tournament cards data stores one row per tournament per card print,
                // so stats must be aggregated before deduplication (like Past Meta).
                // Current meta data is already pre-aggregated — skip aggregation for that.
                //
                // Stale-spelling dedup: append-mode preserves rows from past
                // scrape runs even when the canonical archetype name changed
                // mid-stream (e.g. "Cynthia Garchomp Ex" → "Cynthia's Garchomp").
                // After canonicalizeArchetype() collapses both spellings, the
                // same (archetype, card, meta, print) appears multiple times
                // with overlapping per-source totals — which would inflate
                // deck_count when subsequently summed downstream. Keep only
                // the latest row per dedup-key — CSV row order = scrape recency.
                // Applied to primary AND secondary archetype buckets so the
                // fusion path doesn't pick up stale rows downstream.
                const _staleSpellingDedup = (rows) => {
                    if (!rows || rows.length === 0) return rows;
                    const latestRowMap = new Map();
                    rows.forEach(row => {
                        const key = `${row.archetype}|||${row.card_name || ''}|||${row.meta || ''}|||${row.set_code || ''}|${row.set_number || ''}`;
                        latestRowMap.set(key, row);
                    });
                    if (latestRowMap.size < rows.length) {
                        devLog(`[Current Meta] Stale-spelling dedup: ${rows.length} → ${latestRowMap.size} rows`);
                    }
                    return Array.from(latestRowMap.values());
                };
                if (!needsAggregation) {
                    primaryRows = _staleSpellingDedup(primaryRows);
                    if (fusionActive) secondaryRows = _staleSpellingDedup(secondaryRows);
                }

                // Preserve raw per-tournament rows for Recency scoring in
                // Consistency builder. For fusion, we hand it the union so
                // the scorer sees every original row across both archetypes.
                window.currentMetaRawDeckCards = fusionActive
                    ? primaryRows.concat(secondaryRows)
                    : primaryRows.slice();

                // Per-archetype enrichment BEFORE fusion combines pools. The
                // 'play' path's date-weighted aggregation and the 'all' path's
                // Online+Major additive merge both need the source archetype
                // name to scope their tournament-row lookups, so they only
                // work when applied per archetype rather than to the merged
                // pool. After this pass each archetype's rows already reflect
                // its full Limitless + Major pool; _fuseArchetypeRows then
                // simply pools the two combined sets.
                if (needsAggregation && !fusionActive) {
                    // 'play' filter currently only supports the single-archetype
                    // path — the fusion case bypasses date-weighted aggregation
                    // (documented limitation in PR #145).
                    if (primaryRows.length > 0) primaryRows = aggregateCardStatsByDate(primaryRows);
                } else if (currentMetaFormatFilter === 'all') {
                    // 'Online + Major' filter: combine Meta Live (Online) rows
                    // with the cumulative Major snapshot from tournament_cards_data
                    // additively. Online_count + Major_count over Online_total +
                    // Major_total. tournament_cards_data is the proper Major
                    // source because the Meta Play! rows in
                    // current_meta_card_data.csv are structurally sparse
                    // (Limitless deck-list parser drops most cards). For fusion
                    // we run this merge twice — once per archetype — so each
                    // pool reflects its own Limitless + Major spread before
                    // they pool together.
                    const tournamentRows = window.currentMetaTournamentCardsData || [];
                    if (tournamentRows.length > 0) {
                        if (primaryRows.length > 0) {
                            primaryRows = mergeOnlineMajorAdditive(primaryRows, tournamentRows, archetype);
                        }
                        if (fusionActive && secondaryRows.length > 0) {
                            secondaryRows = mergeOnlineMajorAdditive(secondaryRows, tournamentRows, secondaryArchRaw);
                        }
                    }
                }

                // Combine archetypes (or pass through when single-archetype).
                if (fusionActive && secondaryRows.length > 0) {
                    deckCards = _fuseArchetypeRows(primaryRows, secondaryRows);
                    devLog(`[Current Meta][Fusion] ${archetype} (${primaryRows.length} rows) × ${secondaryArchRaw} (${secondaryRows.length} rows) → ${deckCards.length} merged cards`);
                } else {
                    deckCards = primaryRows;
                }

                // Deduplicate only after statistics have been merged across tournaments/prints.
                deckCards = deduplicateCards(deckCards);
            
                window.currentCurrentMetaDeckCards = deckCards;
                
                // Calculate stats
                // Use max_count to match the filter view calculations for consistency
                // (both must use the same base to avoid logical impossibilities like "87 unique / 75 total")
                const totalCardsInDeck = deckCards.reduce((sum, card) => sum + parseInt(card.max_count || 0, 10), 0);
                const uniqueCards = deckCards.length;
                
                // Get winrate from deck stats
                let winrate = '-';
                const deckStats = window.currentMetaDeckStats || [];
                // Use normalizeArchetypeForMatch (set-code aware) instead
                // of stripExSuffix here — current_meta_card_data.csv carries
                // names like "Crustle Dri" and "Eelektrik Blk" that won't
                // resolve to limitless_online_decks.csv's bare "Crustle" /
                // "Eelektrik" with just-Ex stripping. Falls back to the
                // older stripExSuffix path when the helper isn't loaded.
                const matchKey = (window.normalizeArchetypeForMatch || stripExSuffix);
                const cleanArch = matchKey(archetype);
                const deckStatEntry = deckStats.find(d => d.deck_name && matchKey(d.deck_name) === cleanArch);
                if (deckStatEntry && deckStatEntry.win_rate) {
                    winrate = deckStatEntry.win_rate;
                }
                
                // Calculate matchup vs Top 20
                let matchupVsTop20 = '-';
                const matchupData = window.currentMetaMatchupData || [];
                if (deckStats.length > 0 && matchupData.length > 0) {
                    // Get top 20 decks by rank
                    const top20Decks = deckStats
                        .filter(d => d.rank && parseInt(d.rank) <= 20)
                        .map(d => d.deck_name);
                    
                    // Get matchups against top 20 — use the same set-code-
                    // aware matcher we used for the deck-stat lookup above
                    // so "Crustle Dri" lines up with matchup-grid rows
                    // emitted under the bare "Crustle" key.
                    const relevantMatchups = matchupData.filter(m =>
                        m.deck_name && matchKey(m.deck_name) === cleanArch &&
                        m.opponent && top20Decks.some(deck => deck && deck.toLowerCase() === m.opponent.toLowerCase())
                    );
                    
                    if (relevantMatchups.length > 0) {
                        // Calculate weighted average winrate
                        let totalGames = 0;
                        let totalWins = 0;
                        
                        relevantMatchups.forEach(m => {
                            const games = parseInt(m.total_games) || 0;
                            const winRate = parseLocaleNumber(m.win_rate || '0', 0);
                            totalGames += games;
                            totalWins += (games * winRate / 100);
                        });
                        
                        if (totalGames > 0) {
                            const avgWinrate = (totalWins / totalGames * 100).toFixed(2);
                            matchupVsTop20 = `${avgWinrate}% (${relevantMatchups.length} MU)`;
                        }
                    }
                }
                
                // Update stats
                updateDeckStatsByIds({
                    currentMetaStatCards: `${uniqueCards} / ${totalCardsInDeck}`,
                    currentMetaStatWinrate: winrate,
                    currentMetaStatMatchup: matchupVsTop20
                }, 'currentMetaStatsSection');
                
                // Render matchups
                renderCurrentMetaMatchups(archetype);

                // Render "Matchups vs Meta Call" — picks up window.MetaCall
                // state if available. Silently hides itself when MetaCall
                // hasn't run yet (user lands on Deck Analysis first).
                try { renderMatchupsVsMetaCall(archetype); }
                catch (e) { console.error('[VsMetaCall] render failed:', e); }
                try { renderUserVsVanillaPanel(archetype); }
                catch (e) { console.error('[UserVsVanilla] render failed:', e); }

                // Render Top 256 tournament breakdown (only visible on Major Tournament filter)
                renderCurrentMetaTop256(archetype);
                
                // Render cards using current active view (defaults to table when both are hidden)
                applyCurrentMetaFilter();
                
                // DON'T auto-display deck here - let the caller decide
                // (only display when user actively selects archetype from dropdown)
            }, 100);  // Delay to allow UI to update
        }
        
        function clearCurrentMetaDeckView() {
            ['currentMetaArchetypeCard', 'currentMetaStatsSection', 'currentMetaMatchupsSection', 'currentMetaDeckVisual', 'currentMetaDeckTableView', 'currentMetaTop256Section'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('d-none');
            });
            renderNoDeckSelectedState('currentMetaDeckGrid', 'Bitte waehle ein Deck aus dem Dropdown, um die Karten zu laden');
            resetDeckOverviewCounts('currentMetaCardCount', 'currentMetaCardCountSummary', '0 ' + t('cl.cards'), '/ 0 Total');
        }
        
        // Render "Used in Top 256" breakdown per major tournament for
        // selected archetype. Visible on every Tournament-Format-Filter
        // value (All / Limitless / Major) — the major-tournament
        // breakdown is useful context regardless of the filter the
        // user picked for the deck-cards aggregation.
        async function renderCurrentMetaTop256(archetype) {
            const section = document.getElementById('currentMetaTop256Section');
            const listEl = document.getElementById('currentMetaTop256List');
            if (!section || !listEl) return;

            // Load and cache tournament cards data (filtered by meta date)
            if (!window.currentMetaTournamentCardsData) {
                const rawTournament = await loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true });
                window.currentMetaTournamentCardsDataRaw = rawTournament;
                window.currentMetaTournamentCardsData = filterTournamentRowsByMetaDate(rawTournament);
            }
            const tourData = window.currentMetaTournamentCardsData || [];

            // Collect deck counts per (tournament, snapshot) for the
            // selected archetype.
            //
            // tournament_cards_data_cards.csv stores ONE row per
            // (tournament_id, archetype-label, card). Two data formats
            // coexist in the historical CSVs:
            //
            //   (A) Single-snapshot format — current scraper output:
            //       one archetype label per tournament (no price tag),
            //       `total_decks_in_archetype` repeated on every row
            //       = the true deck count.
            //       e.g. Lucario Hariyama @ Campinas 2026-05-16:
            //            1 distinct label, total_decks_in_archetype=11
            //            on all 35 card rows → 11 decks.
            //
            //   (B) Multi-snapshot format — older scraper output that
            //       price-tagged each distinct decklist into its own
            //       archetype label ("Cynthia's Garchomp27.91$22.10€"
            //       vs "...33.40$24.89€"). Each snapshot's
            //       total_decks_in_archetype was 1 or 2.
            //
            // Correct count for BOTH formats: sum, across distinct
            // snapshot labels per tournament, of MAX(total_decks_in_
            // archetype) for that snapshot.
            //   - (A): 1 snapshot × 11 = 11.
            //   - (B, 16 distinct snapshots × 1 deck each): 16.
            //
            // The previous logic counted distinct snapshot labels
            // (= 1 in case A, = 16 in case B), which was correct for
            // B but produced "1×" everywhere for the current single-
            // snapshot data the user is seeing today.
            const tourMap = new Map();
            tourData.forEach(row => {
                const rowArchetype = normalizeCurrentMetaTournamentArchetypeName(row.archetype);
                if (!rowArchetype || rowArchetype.toLowerCase() !== archetype.toLowerCase()) return;
                const key = row.tournament_name || String(row.tournament_id);
                const snapshotKey = String(row.archetype || row.deck_id || row.tournament_id || '');
                if (!tourMap.has(key)) {
                    tourMap.set(key, {
                        name: row.tournament_name || key,
                        date: row.tournament_date || '',
                        snapshotDecks: new Map(),  // snapshotKey -> max(total_decks_in_archetype)
                    });
                }
                const entry = tourMap.get(key);
                const decks = parseInt(row.total_decks_in_archetype || '0', 10) || 0;
                const prev = entry.snapshotDecks.get(snapshotKey) || 0;
                if (decks > prev) entry.snapshotDecks.set(snapshotKey, decks);
            });
            // Materialize the count from the snapshot-deck map so existing
            // render code (which expects entry.count) still works.
            tourMap.forEach(entry => {
                entry.count = Array.from(entry.snapshotDecks.values()).reduce((a, b) => a + b, 0);
                // Defensive fallback: if every row had total_decks_in_
                // archetype=0 (shouldn't happen, but old CSVs might),
                // fall back to the legacy distinct-snapshot count so we
                // still render something useful rather than "0×".
                if (entry.count === 0) entry.count = entry.snapshotDecks.size;
            });

            if (tourMap.size === 0) {
                section.classList.add('d-none');
                return;
            }

            // Sort newest first using ordinal-aware date parsing
            const parseDate = s => {
                const d = new Date((s || '').replace(/(\d+)(st|nd|rd|th)/, '$1'));
                return isNaN(d) ? new Date(0) : d;
            };
            const tourList = Array.from(tourMap.values()).sort((a, b) => parseDate(b.date) - parseDate(a.date));

            listEl.innerHTML = tourList.map(t =>
                `<div class="top256-entry">` +
                `<span class="top256-count">${t.count}\u00d7</span>` +
                `<span class="top256-tournament">${t.name}</span>` +
                (t.date ? `<span class="top256-date">(${t.date})</span>` : '') +
                `</div>`
            ).join('');
            section.classList.remove('d-none');
        }

        // CSV fallback for renderCurrentMetaMatchups. Computes top/bottom
        // matchups from limitless_online_decks_matchups.csv (loaded into
        // window.currentMetaMatchupData) so the block works for ANY deck
        // the user picks in the Archetype dropdown — not just the top
        // decks present in the preloaded Current-Meta HTML. Returns true
        // when the fallback wrote rows, false when no matchups data is
        // available for the archetype.
        function renderMatchupsFromCSVFallback(archetype, matchupsSection, bestTable, worstTable, titleEl) {
            const rows = window.currentMetaMatchupData;
            if (!Array.isArray(rows) || rows.length === 0) return false;

            const target = archetype.trim().toLowerCase();
            const stripped = stripExSuffix(archetype).trim().toLowerCase();
            const deckMatchups = rows.filter(r => {
                const d = String(r.deck_name || '').trim().toLowerCase();
                return d === target || d === stripped;
            });
            if (deckMatchups.length === 0) return false;

            // Parse "62,50" or "62.50" → 62.50; strip "%" suffix.
            const parseWr = (s) => {
                const v = parseLocaleNumber(s || '0', 0);
                return Number.isFinite(v) ? v : 0;
            };

            const enriched = deckMatchups
                .map(r => ({
                    opponent: r.opponent || '',
                    wr:       parseWr(r.win_rate),
                    record:   r.record || '',
                }))
                // Number.isFinite statt `> 0`: der Filter sollte fehlende Werte
                // ausschliessen, traf aber auch echte Nullen. 51 von 1491 Zeilen in
                // limitless_online_decks_matchups.csv haben win_rate = 0, verteilt
                // auf 32 Decks — darunter Iron Thorns gegen Mega Excadrill mit
                // 0 aus 12. Die Tabelle "Worst Matchups" konnte das schlechteste
                // Matchup eines Decks strukturell nicht anzeigen, und der
                // anteilsgewichtete Schnitt lag dadurch zu hoch. Fehlende Werte
                // kommen als leerer String an und bleiben weiterhin draussen.
                .filter(m => m.opponent && Number.isFinite(m.wr));

            if (enriched.length === 0) return false;

            // Sort by WR. Best = top 5 desc, Worst = bottom 2 asc (mirrors
            // the Current Meta HTML's typical 5+2 split). Tie-break by
            // record length so larger-sample matchups float to the top.
            const byBest  = [...enriched].sort((a, b) => b.wr - a.wr || (b.record.length - a.record.length));
            const byWorst = [...enriched].sort((a, b) => a.wr - b.wr || (b.record.length - a.record.length));

            // Decimal separator matches the active language so the EN
            // view shows "62.5%" and the DE view shows "62,5%".
            const decimal = (getLang() === 'de') ? ',' : '.';
            const fmtPct = (v) => v.toFixed(1).replace('.', decimal);

            const fmtRow = (m) => `
                <tr>
                    <td>${m.opponent}</td>
                    <td>${fmtPct(m.wr)}%</td>
                    <td>${m.record}</td>
                </tr>`;

            const bestRows = byBest.slice(0, 5).map(fmtRow).join('');
            const worstRows = byWorst.slice(0, 2).map(fmtRow).join('');

            bestTable.innerHTML  = bestRows  || '<tr><td colspan="3" style="text-align:center;padding:20px;">' + t('heatmap.noData') + '</td></tr>';
            worstTable.innerHTML = worstRows || '<tr><td colspan="3" style="text-align:center;padding:20px;">' + t('heatmap.noData') + '</td></tr>';

            // Title — best-effort: archetype name + average WR. No rank
            // or vs-Top20 numbers here since they're not in the matchups
            // CSV; the HTML extraction path overrides this when available.
            const avgWr = enriched.reduce((s, m) => s + m.wr, 0) / enriched.length;
            if (titleEl) {
                titleEl.textContent = `${archetype} (${t('matchup.avgWr')} ${fmtPct(avgWr)}%, ${enriched.length} ${t('matchup.matchups')})`;
            }

            matchupsSection.classList.remove('d-none');
            matchupsSection.classList.remove('display-none');
            return true;
        }

        // Render "Matchups vs Meta Call" panel — shows the selected deck's
        // expected performance against the Meta Call predicted tournament
        // field. Pulls the field from window.MetaCall.getPredictedField()
        // and per-opponent WR from the matchups CSV; computes a share-
        // weighted average WR + best/worst lists within the predicted
        // field. Hides the panel when MetaCall hasn't rendered yet (e.g.
        // user landed on Deck Analysis before opening the Meta Call tab).
        function renderMatchupsVsMetaCall(archetype) {
            const section = document.getElementById('currentMetaVsMetaCallSection');
            const summaryEl = document.getElementById('currentMetaVsMetaCallSummary');
            const tbody = document.getElementById('currentMetaVsMetaCallBody');
            if (!section || !tbody) return;

            const hideSection = (reason) => {
                section.classList.add('display-none');
                if (reason) devLog(`[VsMetaCall] hidden: ${reason}`);
            };

            if (!archetype) return hideSection('no archetype');
            if (typeof window.MetaCall === 'undefined' ||
                typeof window.MetaCall.getPredictedField !== 'function') {
                return hideSection('MetaCall not loaded');
            }

            const field = window.MetaCall.getPredictedField() || [];
            if (field.length === 0) return hideSection('predicted field empty — open Meta Call tab to populate');

            const rows = window.currentMetaMatchupData;
            if (!Array.isArray(rows) || rows.length === 0) {
                return hideSection('matchup CSV not loaded');
            }

            // Build opponent → WR lookup from CSV (1:1 to the matchups CSV,
            // not from MetaCall's adjusted matrix — keeps the panel about
            // pure online performance which is what the deck-builder is
            // calibrating against).
            const target = archetype.trim().toLowerCase();
            const stripped = stripExSuffix(archetype).trim().toLowerCase();
            const parseWr = (s) => {
                const v = parseLocaleNumber(s || '0', 0);
                return Number.isFinite(v) ? v : 0;
            };
            const wrByOpp = {};
            rows.forEach(r => {
                const d = String(r.deck_name || '').trim().toLowerCase();
                if (d !== target && d !== stripped) return;
                const opp = String(r.opponent || '').trim();
                const wr = parseWr(r.win_rate);
                if (opp && Number.isFinite(wr)) wrByOpp[opp.toLowerCase()] = { opponent: opp, wr };
            });

            if (Object.keys(wrByOpp).length === 0) {
                return hideSection(`no matchup rows for ${archetype}`);
            }

            // Pair every field deck with its WR lookup. No top-N cap —
            // the user explicitly wants the complete table sorted by
            // share. Skip mirror matches (same deck vs itself).
            const paired = field
                .map(d => {
                    const k = String(d.name || '').trim().toLowerCase();
                    if (k === target || k === stripped) return null;
                    const hit = wrByOpp[k];
                    if (!hit) return null;
                    return {
                        opponent:   hit.opponent,
                        fieldShare: d.finalShare || 0,
                        wr:         hit.wr,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b.fieldShare - a.fieldShare);

            if (paired.length === 0) {
                return hideSection('no field decks have matchup data');
            }

            // Share-weighted average WR — the headline number. Coverage
            // is computed against the full top-12 field so the user sees
            // how much of the meaningful meta the panel actually reflects.
            const totalShare = paired.reduce((s, p) => s + p.fieldShare, 0) || 1;
            const weightedWr = paired.reduce((s, p) => s + p.wr * p.fieldShare, 0) / totalShare;
            const FIELD_REF_TOP_N = 12;
            const top12Share = field.slice(0, FIELD_REF_TOP_N).reduce((s, d) => s + (d.finalShare || 0), 0) || 1;
            const matchedTop12 = paired.filter(p => p.fieldShare > 0).reduce((s, p) => s + p.fieldShare, 0);
            const coveragePct = Math.min(100, (matchedTop12 / top12Share) * 100);

            // Verdict — same thresholds as the per-row WR pills below.
            // i18n strings keep the verdict text aligned EN/DE.
            const wrClass = wrColorClass(weightedWr);
            const verdictKey =
                weightedWr >= 60 ? 'matchup.verdictStrongPos' :
                weightedWr >= 53 ? 'matchup.verdictPos' :
                weightedWr >= 47 ? 'matchup.verdictEven' :
                weightedWr >= 40 ? 'matchup.verdictNeg' :
                                   'matchup.verdictStrongNeg';

            // EN uses "." as decimal separator, DE uses ",". Other
            // locale conventions (thousands separator) aren't relevant
            // here since values stay under 100 %.
            const decimal = (getLang() === 'de') ? ',' : '.';
            const fmt = (v, d = 1) => v.toFixed(d).replace('.', decimal);

            summaryEl.innerHTML = `
                <div class="mc-vs-summary-row">
                    <span class="mc-vs-summary-label">${t('matchup.weightedWrLabel')}</span>
                    <span class="mc-vs-pill ${wrClass}">${fmt(weightedWr)}%</span>
                    <span class="mc-vs-summary-verdict">${t(verdictKey)}</span>
                    <span class="mc-vs-summary-coverage">${t('matchup.fieldCoverage')} ${coveragePct.toFixed(0)}% (${paired.length} ${t('matchup.opponents')})</span>
                </div>`;

            const fmtRow = (m) => `
                <tr>
                    <td>${escapeHtml(m.opponent)}</td>
                    <td class="mc-vs-share">${fmt(m.fieldShare, 2)}%</td>
                    <td class="mc-vs-wr"><span class="mc-vs-pill ${wrColorClass(m.wr)}">${fmt(m.wr)}%</span></td>
                </tr>`;

            tbody.innerHTML = paired.map(fmtRow).join('') ||
                '<tr><td colspan="3" class="mc-vs-empty">' + t('heatmap.noData') + '</td></tr>';

            section.classList.remove('display-none');
        }

        // ──────────────────────────────────────────────────────────
        // User Deck vs Vanilla Build — Meta-Call-weighted
        //
        // Sits below renderMatchupsVsMetaCall. Compares the user's
        // current deck against a vanilla consistency baseline of the
        // same archetype, expressing the difference as a single
        // share-weighted WR per side over the Meta-Call predicted
        // field.
        //
        // The baseline ("Vanilla") = the archetype's raw matchup-CSV
        // WRs, unchanged. The user side = the same WRs plus a
        // per-opponent tech-counter bonus / penalty: for every
        // counter-card category the user runs that the opponent's
        // threat profile lists, +3 pts (cap +9 / matchup). Missing
        // counters that the meta would expect (vanilla's archetype
        // typically runs them but the user dropped them) cost
        // -2 pts each. This is a heuristic — labelled as such in
        // the UI — built on the same active_threats.json the
        // Consistency Generator already consumes.
        //
        // Read-only: never mutates the deck. Re-renders on archetype
        // selection. For live deck-edit updates the caller should
        // expose window.refreshUserVsVanillaPanel and trigger it.
        // ──────────────────────────────────────────────────────────
        const _USER_VS_VANILLA_BONUS_PER_CAT = 3;
        const _USER_VS_VANILLA_BONUS_CAP = 9;

        let _activeThreatsPromise = null;
        function _loadActiveThreats() {
            if (typeof window === 'undefined') return Promise.resolve(null);
            if (window._activeThreatsCache !== undefined) {
                return Promise.resolve(window._activeThreatsCache);
            }
            if (_activeThreatsPromise) return _activeThreatsPromise;
            _activeThreatsPromise = fetch('data/active_threats.json', { cache: 'no-cache' })
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
                .then(data => {
                    window._activeThreatsCache = data;
                    return data;
                });
            return _activeThreatsPromise;
        }

        // archetype name (lower) → Set<categoryName>. Built once per
        // active_threats payload and stashed on window so other tabs
        // can reuse it without redoing the scan.
        function _archetypeThreatCategoryMap(intel) {
            if (window._archetypeThreatCats) return window._archetypeThreatCats;
            const map = new Map();
            if (!intel || !intel.threats) {
                window._archetypeThreatCats = map;
                return map;
            }
            for (const [cat, info] of Object.entries(intel.threats)) {
                if (!info || !Array.isArray(info.cards)) continue;
                info.cards.forEach(threatCard => {
                    if (!Array.isArray(threatCard.archetypes)) return;
                    threatCard.archetypes.forEach(a => {
                        const name = String(a.archetype || '').trim().toLowerCase();
                        if (!name) return;
                        if (!map.has(name)) map.set(name, new Set());
                        map.get(name).add(cat);
                    });
                });
            }
            window._archetypeThreatCats = map;
            return map;
        }

        // counter card name (lower) → Set<categoryName>.
        function _counterCardCategoryMap(intel) {
            if (window._counterCardCats) return window._counterCardCats;
            const map = new Map();
            if (!intel || !intel.counters) {
                window._counterCardCats = map;
                return map;
            }
            for (const [cat, list] of Object.entries(intel.counters)) {
                if (!Array.isArray(list)) continue;
                list.forEach(c => {
                    const name = String(c.card_name || '').trim().toLowerCase();
                    if (!name) return;
                    if (!map.has(name)) map.set(name, new Set());
                    map.get(name).add(cat);
                });
            }
            window._counterCardCats = map;
            return map;
        }

        // Pull the user's deck object for the current-meta source and
        // return a Set<lower-cased-base-card-name>. Strips the
        // "(SET NUM)" suffix from deck keys.
        function _userDeckCardNames() {
            const deck = (typeof window !== 'undefined' && window.currentMetaDeck) || {};
            const names = new Set();
            Object.keys(deck).forEach(key => {
                if ((deck[key] || 0) <= 0) return;
                const m = String(key).match(/^(.+?)\s*\(/);
                const base = (m ? m[1] : key).trim().toLowerCase();
                if (base) names.add(base);
            });
            return names;
        }

        // Headline: counters the user is running, grouped by category.
        // Returns a Map<category, Set<counter-card-name>>.
        function _userCounterCategories(userNames, counterCats) {
            const result = new Map();
            userNames.forEach(name => {
                const cats = counterCats.get(name);
                if (!cats) return;
                cats.forEach(cat => {
                    if (!result.has(cat)) result.set(cat, new Set());
                    result.get(cat).add(name);
                });
            });
            return result;
        }

        async function renderUserVsVanillaPanel(archetype) {
            const section = document.getElementById('currentMetaUserVsVanillaSection');
            const summaryEl = document.getElementById('currentMetaUserVsVanillaSummary');
            const detailEl = document.getElementById('currentMetaUserVsVanillaDetail');
            if (!section || !summaryEl || !detailEl) return;

            const hide = (reason) => {
                section.classList.add('display-none');
                if (reason) devLog(`[UserVsVanilla] hidden: ${reason}`);
            };

            if (!archetype) return hide('no archetype');
            if (typeof window.MetaCall === 'undefined' ||
                typeof window.MetaCall.getPredictedField !== 'function') {
                return hide('MetaCall not loaded');
            }

            const field = window.MetaCall.getPredictedField() || [];
            if (field.length === 0) return hide('predicted field empty');

            const rows = window.currentMetaMatchupData;
            if (!Array.isArray(rows) || rows.length === 0) return hide('matchup CSV missing');

            const target = archetype.trim().toLowerCase();
            const stripped = stripExSuffix(archetype).trim().toLowerCase();
            const parseWr = (s) => {
                const v = parseLocaleNumber(s || '0', 0);
                return Number.isFinite(v) ? v : 0;
            };
            const wrByOpp = {};
            rows.forEach(r => {
                const d = String(r.deck_name || '').trim().toLowerCase();
                if (d !== target && d !== stripped) return;
                const opp = String(r.opponent || '').trim();
                const wr = parseWr(r.win_rate);
                if (opp && Number.isFinite(wr)) wrByOpp[opp.toLowerCase()] = { opponent: opp, wr };
            });
            if (Object.keys(wrByOpp).length === 0) return hide(`no matchup rows for ${archetype}`);

            const intel = await _loadActiveThreats();
            if (!intel) return hide('active_threats.json unavailable');

            const archetypeThreatCats = _archetypeThreatCategoryMap(intel);
            const counterCats = _counterCardCategoryMap(intel);
            const userNames = _userDeckCardNames();
            const userByCat = _userCounterCategories(userNames, counterCats);

            if (userNames.size === 0) {
                summaryEl.innerHTML = `
                    <div class="mc-vs-summary-row">
                        <span class="mc-vs-summary-label">${t('matchup.userVsVanillaEmpty') || 'No deck loaded — add or generate cards to compare.'}</span>
                    </div>`;
                detailEl.innerHTML = '';
                _renderCardDiffSection(archetype);
                section.classList.remove('display-none');
                return;
            }

            const paired = field
                .map(d => {
                    const k = String(d.name || '').trim().toLowerCase();
                    if (k === target || k === stripped) return null;
                    const hit = wrByOpp[k];
                    if (!hit) return null;
                    const oppCats = archetypeThreatCats.get(k) || new Set();
                    let matchedCats = 0;
                    const matchedNames = [];
                    oppCats.forEach(cat => {
                        if (userByCat.has(cat)) {
                            matchedCats += 1;
                            matchedNames.push(cat);
                        }
                    });
                    const bonus = Math.min(_USER_VS_VANILLA_BONUS_CAP,
                                            matchedCats * _USER_VS_VANILLA_BONUS_PER_CAT);
                    return {
                        opponent:    hit.opponent,
                        opponentKey: k,
                        fieldShare:  d.finalShare || 0,
                        wr:          hit.wr,
                        userWr:      Math.max(0, Math.min(100, hit.wr + bonus)),
                        matchedCats: matchedNames,
                        bonus,
                    };
                })
                .filter(Boolean)
                .sort((a, b) => b.fieldShare - a.fieldShare);

            if (paired.length === 0) return hide('no field decks have matchup data');

            const totalShare = paired.reduce((s, p) => s + p.fieldShare, 0) || 1;

            // Run the card-text capability engine BEFORE the WR
            // aggregation so detected tech-wins (e.g. Spiky Hopper
            // bypasses Crustle's ex-immunity) flow into the per-
            // opponent userWr value and the aggregate "Your Build"
            // pill. Returns Map<opponentName, {matchups, winsBonus}>.
            // Bonus is the sum of matchup_value over unique
            // attacker→defender interaction tags where result is
            // 'attacker_wins', capped per opponent to prevent any
            // single matchup from swinging WR by more than 15 pts.
            const capabilityData = await _computeCapabilityBonuses(paired);
            if (capabilityData && capabilityData.size > 0) {
                paired.forEach(p => {
                    const d = capabilityData.get(p.opponent);
                    if (!d || d.winsBonus <= 0) return;
                    const before = p.userWr;
                    p.userWr = Math.max(0, Math.min(100, p.userWr + d.winsBonus));
                    p.bonus  = (p.bonus || 0) + d.winsBonus;
                    p._capabilityWinsBonus = d.winsBonus;
                    p._capabilityMatchups  = d.matchups;
                    if (typeof console !== 'undefined') {
                        console.log('[CapabilityDetector] WR boost',
                            p.opponent, '|', before.toFixed(1) + '%',
                            '+', d.winsBonus, 'pts →',
                            p.userWr.toFixed(1) + '%');
                    }
                });
            }

            const vanillaWr = paired.reduce((s, p) => s + p.wr * p.fieldShare, 0) / totalShare;
            const userWr    = paired.reduce((s, p) => s + p.userWr * p.fieldShare, 0) / totalShare;
            const delta     = userWr - vanillaWr;

            const decimal = (getLang() === 'de') ? ',' : '.';
            const fmt = (v, d = 1) => v.toFixed(d).replace('.', decimal);
            const signed = (v) => (v >= 0 ? `+${fmt(v)}` : fmt(v));
            const arrow = delta >= 0.05 ? '↑' : delta <= -0.05 ? '↓' : '→';
            const deltaClass = delta >= 0.5 ? 'wr-pos' : delta <= -0.5 ? 'wr-neg' : 'wr-neutral';

            const vanillaClass = wrColorClass(vanillaWr);
            const userClass = wrColorClass(userWr);

            const matchedOpponents = paired.filter(p => p.bonus > 0).length;
            const userCounterCount = Array.from(userByCat.values()).reduce((s, set) => s + set.size, 0);

            summaryEl.innerHTML = `
                <div class="mc-vs-summary-row uv-summary-row">
                    <div class="uv-pill-block">
                        <span class="mc-vs-summary-label">${t('matchup.userVsVanillaVanilla') || 'Vanilla'}</span>
                        <span class="mc-vs-pill ${vanillaClass}">${fmt(vanillaWr)}%</span>
                    </div>
                    <span class="uv-arrow ${deltaClass}">${arrow}</span>
                    <div class="uv-pill-block">
                        <span class="mc-vs-summary-label">${t('matchup.userVsVanillaYou') || 'Your Build'}</span>
                        <span class="mc-vs-pill ${userClass}">${fmt(userWr)}%</span>
                    </div>
                    <div class="uv-pill-block">
                        <span class="mc-vs-summary-label">${t('matchup.userVsVanillaDelta') || 'Delta'}</span>
                        <span class="mc-vs-pill ${deltaClass}">${signed(delta)}pts</span>
                    </div>
                </div>`;

            const breakdownLines = [];
            if (userCounterCount > 0) {
                // Per-category detail so the user can audit which exact
                // cards the active_threats.json classification credited
                // — important when a card looks miscategorised (e.g.
                // Lillie's Determination labeled as a hand_disruption
                // counter while the player treats it as pure setup).
                const lineTpl = t('matchup.userVsVanillaBreakdownCategoryLine') || '{cat}: {cards}';
                const cardEsc = (s) => escapeHtml(String(s || ''));
                const headerLine = t('matchup.userVsVanillaBreakdownCountersDetail') || 'Tech cards detected in your build by category:';
                breakdownLines.push(`<strong>${escapeHtml(headerLine)}</strong>`);
                Array.from(userByCat.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .forEach(([cat, nameSet]) => {
                        const names = Array.from(nameSet).sort().map(cardEsc).join(', ');
                        breakdownLines.push(
                            lineTpl
                                .replace('{cat}', `<em>${escapeHtml(cat)}</em>`)
                                .replace('{cards}', names)
                        );
                    });
            } else {
                breakdownLines.push(t('matchup.userVsVanillaBreakdownNoCounters') || 'No tech-counter cards detected — your deck performs at vanilla baseline.');
                // Explain the limitation. The counter library in
                // active_threats.json is intentionally narrow (only
                // cards that defend against specific threat categories
                // — hand_disruption, retreat_lock, bench_damage,
                // ability_lock). Archetype-internal tools like Scoop
                // Up Cyclone or Binding Mochi are not tracked here
                // even though they're tactically meaningful.
                breakdownLines.push(t('matchup.userVsVanillaBreakdownLibraryNote') || 'Note: the counter library only tracks cards explicitly listed in data/active_threats.json. Archetype-internal tools (e.g. ACE SPECs, generic Pokemon Tools, in-archetype draw supporters) are not counted unless added to that list.');
            }
            breakdownLines.push(
                (t('matchup.userVsVanillaBreakdownMatched') || 'Bonus applied vs {m}/{n} opponents in the predicted field.')
                    .replace('{m}', matchedOpponents).replace('{n}', paired.length)
            );
            breakdownLines.push(
                t('matchup.userVsVanillaHeuristicNote') || 'Heuristic estimate (+3pts per matched threat category, cap +9pts/matchup).'
            );

            detailEl.innerHTML = `
                <ul class="uv-breakdown">${breakdownLines.map(l => `<li>${l}</li>`).join('')}</ul>`;

            // Per-opponent vanilla vs build comparison. The aggregated
            // pills above hide WHICH opponents the bonus fired on —
            // this table surfaces that explicitly so the user can sanity
            // check whether the tech adjustment maps to the matchups
            // they actually expect.
            const oppBody = document.getElementById('currentMetaUserVsVanillaOpponentBody');
            if (oppBody) {
                const fmtDelta = (b) => {
                    if (b === 0) return '<span class="uv-delta-none">—</span>';
                    const cls = b > 0 ? 'wr-pos' : 'wr-neg';
                    const sign = b > 0 ? '+' : '';
                    return `<span class="mc-vs-pill ${cls}">${sign}${fmt(b)}pts</span>`;
                };
                const oppRow = (p) => `
                    <tr>
                        <td>${escapeHtml(p.opponent)}</td>
                        <td class="mc-vs-share">${fmt(p.fieldShare, 2)}%</td>
                        <td class="mc-vs-wr"><span class="mc-vs-pill ${wrColorClass(p.wr)}">${fmt(p.wr)}%</span></td>
                        <td class="mc-vs-wr"><span class="mc-vs-pill ${wrColorClass(p.userWr)}">${fmt(p.userWr)}%</span></td>
                        <td class="mc-vs-wr">${fmtDelta(p.bonus)}</td>
                    </tr>`;
                oppBody.innerHTML = paired.map(oppRow).join('') ||
                    `<tr><td colspan="5" class="mc-vs-empty">${t('heatmap.noData') || 'No data available'}</td></tr>`;
            }

            // Card-text capability detector — render using the data
            // already computed before the WR aggregation. The detector
            // section sits ABOVE the per-opponent table (see
            // index.html). Only `attacker_wins` interactions are
            // displayed; `defender_wins` (e.g. opponent's Shaymin
            // blocks user's bench-snipe) and `neutral` interactions
            // are filtered out so the section reads as "your techs
            // against the field", not "the field's techs against you".
            _renderCapabilityTechSection(capabilityData);

            _renderCardDiffSection(archetype);

            section.classList.remove('display-none');
        }

        // Builds the user-deck-card-key list (SET|number + name) from
        // window.currentMetaDeck. Keys in the deck look like
        // "Mega Lopunny ex (PFL 84)" — extract the set+number from
        // the parenthesised suffix so we can hit pokemon_card_effects
        // by its primary SET|number index instead of relying on the
        // name fallback (which collides for cards with multiple prints
        // and reprints).
        function _userDeckCardKeys() {
            const deck = (typeof window !== 'undefined' && window.currentMetaDeck) || {};
            const out = [];
            const reSetNum = /\(([A-Z0-9]+)\s+([A-Za-z0-9]+)\)\s*$/;
            for (const rawKey of Object.keys(deck)) {
                if ((deck[rawKey] || 0) <= 0) continue;
                const m = rawKey.match(reSetNum);
                const name = (rawKey.replace(reSetNum, '').trim());
                out.push({
                    key:  m ? `${m[1]}|${m[2]}` : null,
                    name: name,
                });
            }
            return out;
        }

        // Maps each archetype name (lower-cased) to the cards that
        // archetype runs in current_meta_card_data. Source rows look
        // like { archetype, card_name, set_code, set_number, ... } —
        // we keep cards with deck_inclusion_count > 0 (i.e. at least
        // one deck in the archetype actually plays it). Cache key
        // tracks the source row count so the map is rebuilt whenever
        // currentMetaAnalysisData changes (e.g. tab loaded data after
        // the panel rendered once with an empty dataset).
        function _buildArchetypeCardMap() {
            const rows = window.currentMetaAnalysisData || [];
            const cacheTag = `rows=${rows.length}`;
            if (window._archetypeCardMap && window._archetypeCardMapTag === cacheTag) {
                return window._archetypeCardMap;
            }
            const map = new Map();
            for (const r of rows) {
                if (!r) continue;
                const arch = String(r.archetype || '').trim().toLowerCase();
                if (!arch) continue;
                const set = String(r.set_code || '').toUpperCase().trim();
                const num = String(r.set_number || '').trim();
                if (!set || !num) continue;
                const key = `${set}|${num}`;
                const name = String(r.card_name || '').trim();
                if (!map.has(arch)) map.set(arch, []);
                map.get(arch).push({ key, name });
            }
            window._archetypeCardMap = map;
            window._archetypeCardMapTag = cacheTag;
            return map;
        }

        // Per-opponent capability matchup cap. A single matchup can't
        // swing WR by more than this many points regardless of how
        // many strong tech interactions fire. Two unique tech wins
        // (e.g. ex-immunity bypass + KO-prevention bypass) can stack
        // up to the cap; a third doesn't push further.
        const _CAPABILITY_BONUS_CAP = 15;

        // Computes detected matchups + WR bonuses for each opponent
        // in the predicted field. Pure data — no DOM writes. The
        // caller folds winsBonus into paired[].userWr before
        // rendering the summary/table, then passes the data into
        // _renderCapabilityTechSection for the narrative list. Logs
        // are unconditional console.log calls (devLog is silenced in
        // production) so the trail is visible during diagnostics.
        async function _computeCapabilityBonuses(pairedOpponents) {
            const log = (...a) => console.log('[CapabilityDetector]', ...a);
            if (typeof window.CardCapabilityEngine === 'undefined') {
                log('window.CardCapabilityEngine undefined — script not loaded?');
                return null;
            }
            const userDeckCards = _userDeckCardKeys();
            log('user deck cards parsed:', userDeckCards.length, userDeckCards.slice(0, 4));
            if (userDeckCards.length === 0) return null;

            const cardEffectsIndex = (typeof window._loadCardEffectsIndex === 'function')
                ? await window._loadCardEffectsIndex()
                : (window._cardEffectsIndex || null);
            log('cardEffectsIndex size:', cardEffectsIndex && cardEffectsIndex.size);
            if (!cardEffectsIndex || !cardEffectsIndex.size) return null;

            const archetypeCardMap = _buildArchetypeCardMap();
            log('archetypeCardMap keys:', archetypeCardMap.size, 'sample:', Array.from(archetypeCardMap.keys()).slice(0, 5));

            const fieldArchetypes = new Map();
            const lookupMisses = [];
            for (const p of pairedOpponents) {
                const k = (p.opponentKey || p.opponent || '').toLowerCase();
                const cards = archetypeCardMap.get(k);
                if (cards && cards.length) {
                    fieldArchetypes.set(p.opponent, cards);
                } else {
                    lookupMisses.push(k);
                }
            }
            log('field archetypes matched:', fieldArchetypes.size, '/ misses:', lookupMisses);

            const lang = (typeof getLang === 'function') ? getLang() : 'en';
            let detected;
            try {
                detected = await window.CardCapabilityEngine.detectMatchups({
                    userDeckCards,
                    archetypeCardMap: fieldArchetypes,
                    cardEffectsIndex,
                    lang,
                });
            } catch (err) {
                console.error('[CapabilityDetector] runtime error:', err);
                return null;
            }
            log('detected matchups for opponents:', detected ? detected.size : 0);
            if (!detected || detected.size === 0) return new Map();

            // Build the per-opponent display-and-bonus tuples. Only
            // attacker_wins interactions count — defender_wins are
            // opponent counters against the user (e.g. Shaymin
            // shutting down our bench-snipe attack), neutral
            // interactions are ambiguous outcomes. Both are filtered
            // out so this section reads cleanly as "your techs
            // against the field". For the WR bonus, the same
            // interaction tag fired by multiple attacker cards
            // counts once (having two ignores_effects attackers
            // isn't double the win, just more redundant access).
            const out = new Map();
            for (const [oppName, matchups] of detected.entries()) {
                const wins = matchups.filter(m => m.result === 'attacker_wins');
                if (wins.length === 0) continue;
                const seenInteractions = new Set();
                let totalBonus = 0;
                for (const m of wins) {
                    if (seenInteractions.has(m.interactionTag)) continue;
                    seenInteractions.add(m.interactionTag);
                    totalBonus += (m.matchupValue || 0);
                }
                const capped = Math.min(totalBonus, _CAPABILITY_BONUS_CAP);
                out.set(oppName, {
                    matchups: wins,
                    winsBonus: capped,
                    winsBonusRaw: totalBonus,
                });
            }
            log('attacker_wins matchups after filter:', out.size, 'opponents');
            return out;
        }

        // Renders the "Detected tech matchups" narrative list using
        // pre-computed capability data from _computeCapabilityBonuses.
        // Pure DOM — no engine calls, no data computation.
        function _renderCapabilityTechSection(capabilityData) {
            const container = document.getElementById('currentMetaUserVsVanillaDetectedTech');
            if (!container) return;
            const header = t('matchup.detectedTechHeader') || 'Detected tech interactions';
            // Empty state: hide the section entirely so the user isn't
            // confronted with a header + "none" message that adds no
            // value when the deck simply has no card-text interactions
            // against the predicted field. Was a dev-facing note about
            // the matcher's foundation / regex library — pure noise for
            // anyone who isn't building the engine.
            if (!capabilityData || capabilityData.size === 0) {
                container.innerHTML = '';
                return;
            }
            const confidenceLabel = (c) => {
                if (c === 'high')   return t('matchup.techConfidenceHigh')   || 'high confidence';
                if (c === 'medium') return t('matchup.techConfidenceMedium') || 'medium confidence';
                return t('matchup.techConfidenceLow') || 'low confidence';
            };
            const items = [];
            for (const [oppName, data] of capabilityData.entries()) {
                const bonusBadge = data.winsBonus > 0
                    ? ` <span class="uv-tech-bonus">+${data.winsBonus}pts</span>`
                    : '';
                items.push(`<li class="uv-tech-opp"><strong>vs ${escapeHtml(oppName)}</strong>${bonusBadge}<ul class="uv-tech-list">${
                    data.matchups.map(m =>
                        `<li class="uv-tech-line uv-tech-${m.confidence}">${escapeHtml(m.narrative)} <span class="uv-tech-meta">(${escapeHtml(confidenceLabel(m.confidence))})</span></li>`
                    ).join('')
                }</ul></li>`);
            }
            container.innerHTML = `
                <div class="uv-tech-section">
                    <h4 class="uv-tech-title">${escapeHtml(header)} <span class="uv-tech-count">(${capabilityData.size})</span></h4>
                    <ul class="uv-tech-opp-list">${items.join('')}</ul>
                </div>`;
            console.log('[CapabilityDetector] rendered section:', capabilityData.size, 'opponent groups');
        }

        // Card-by-card diff between the user's current deck and the
        // baseline Vanilla snapshot captured the last time
        // autoCompleteConsistency ran. Renders into
        // #currentMetaUserVsVanillaCardDiff. Falls back to an empty
        // state when no Vanilla snapshot exists for this source yet.
        function _renderCardDiffSection(archetype) {
            const container = document.getElementById('currentMetaUserVsVanillaCardDiff');
            if (!container) return;

            const baseline = (window.lastVanillaDeck && window.lastVanillaDeck.currentMeta) || null;
            if (!baseline) {
                container.innerHTML = `
                    <div class="uv-card-diff-empty">
                        ${t('matchup.userVsVanillaDiffNoBaseline') || 'Run Consistency Generate to capture a Vanilla baseline — the card-level diff appears here once you start editing.'}
                    </div>`;
                return;
            }

            // Per-card counts in user's deck, keyed by base card name
            // (set/print stripped). Aggregates across multiple prints
            // of the same card.
            const userByName = new Map();
            const deck = (typeof window !== 'undefined' && window.currentMetaDeck) || {};
            Object.entries(deck).forEach(([key, count]) => {
                if ((count || 0) <= 0) return;
                const m = String(key).match(/^(.+?)\s*\(/);
                const base = (m ? m[1] : key).trim();
                if (!base) return;
                userByName.set(base, (userByName.get(base) || 0) + count);
            });

            // Build the diff set by union of card names from both
            // sides. Skip the internal __ keys captured alongside the
            // snapshot (e.g. __archetype, __capturedAt).
            const allNames = new Set();
            Object.keys(baseline).forEach(k => { if (!k.startsWith('__')) allNames.add(k); });
            userByName.forEach((_v, k) => allNames.add(k));

            const diffs = [];
            allNames.forEach(name => {
                const userCount = userByName.get(name) || 0;
                const vanillaCount = baseline[name] || 0;
                const delta = userCount - vanillaCount;
                if (delta === 0) return;
                diffs.push({ name, userCount, vanillaCount, delta });
            });

            // Banner showing whether the snapshot matches the
            // currently-selected archetype. If the user generated for
            // archetype A and then switches to archetype B, the diff
            // is meaningless — flag it instead of silently misleading.
            const baselineArch = baseline.__archetype || null;
            const archMismatch = baselineArch &&
                                  baselineArch.trim().toLowerCase() !== archetype.trim().toLowerCase();
            const mismatchBanner = archMismatch
                ? `<div class="uv-card-diff-mismatch">${
                    (t('matchup.userVsVanillaDiffMismatch') || 'Vanilla baseline was captured for "{src}" — run Consistency Generate for "{tgt}" to refresh.')
                        .replace('{src}', baselineArch).replace('{tgt}', archetype)
                }</div>`
                : '';

            if (diffs.length === 0) {
                container.innerHTML = `
                    ${mismatchBanner}
                    <div class="uv-card-diff-empty">
                        ${t('matchup.userVsVanillaDiffMatch') || 'Your deck matches the Vanilla baseline card-for-card.'}
                    </div>`;
                return;
            }

            diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));

            const added = diffs.filter(d => d.delta > 0);
            const removed = diffs.filter(d => d.delta < 0);

            const renderEntry = (d) => {
                const cls = d.delta > 0 ? 'uv-diff-add' : 'uv-diff-rem';
                const sign = d.delta > 0 ? '+' : '';
                return `<li class="${cls}">
                    <span class="uv-diff-delta">${sign}${d.delta}</span>
                    <span class="uv-diff-name">${escapeHtml(d.name)}</span>
                    <span class="uv-diff-counts">${d.userCount} / ${d.vanillaCount}</span>
                </li>`;
            };

            const heading = t('matchup.userVsVanillaDiffHeading') || 'Card diff vs Vanilla';
            const subHeading = t('matchup.userVsVanillaDiffSub') || 'user / vanilla';
            const addedLabel = t('matchup.userVsVanillaDiffAdded') || 'Added vs Vanilla';
            const removedLabel = t('matchup.userVsVanillaDiffRemoved') || 'Cut vs Vanilla';

            container.innerHTML = `
                ${mismatchBanner}
                <div class="uv-card-diff-header">
                    <h4 class="uv-card-diff-title">${heading}</h4>
                    <span class="uv-card-diff-sub">${subHeading}</span>
                </div>
                <div class="uv-card-diff-grid">
                    ${added.length > 0 ? `<div class="uv-card-diff-col">
                        <div class="uv-card-diff-col-label uv-diff-add-label">${addedLabel} (${added.length})</div>
                        <ul class="uv-card-diff-list">${added.map(renderEntry).join('')}</ul>
                    </div>` : ''}
                    ${removed.length > 0 ? `<div class="uv-card-diff-col">
                        <div class="uv-card-diff-col-label uv-diff-rem-label">${removedLabel} (${removed.length})</div>
                        <ul class="uv-card-diff-list">${removed.map(renderEntry).join('')}</ul>
                    </div>` : ''}
                </div>`;
        }

        // Expose so deck-mutation callbacks can re-trigger the panel
        // without forcing the user to reselect the archetype.
        if (typeof window !== 'undefined') {
            window.refreshUserVsVanillaPanel = () => {
                try {
                    const sel = document.getElementById('currentMetaArchetypeSelect');
                    const archetype = (sel && sel.value) || window.currentMetaArchetype;
                    if (archetype && archetype !== 'all') renderUserVsVanillaPanel(archetype);
                } catch (e) { devLog('[UserVsVanilla] refresh failed:', e); }
            };
        }

        // WR → CSS class for the color-coded pill. Thresholds match the
        // legend strip rendered below the table.
        function wrColorClass(wr) {
            if (wr >= 60) return 'wr-strong-pos';
            if (wr >= 53) return 'wr-pos';
            if (wr >= 47) return 'wr-neutral';
            if (wr >= 40) return 'wr-neg';
            return 'wr-strong-neg';
        }
        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({
                '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
            }[c]));
        }

        // Render best/worst matchups for Current Meta - extract directly from loaded HTML (1:1 copy)
        function renderCurrentMetaMatchups(archetype) {
            const deckStats = window.currentMetaDeckStats || [];
            const matchupsSection = document.getElementById('currentMetaMatchupsSection');
            const bestTable = document.getElementById('currentMetaBestMatchups');
            const worstTable = document.getElementById('currentMetaWorstMatchups');
            const titleEl = document.getElementById('currentMetaMatchupsTitle');
            
            // Find the matchup tables directly from the loaded HTML content (1:1 same as Current Meta Tab)
            const currentMetaContent = document.getElementById('currentMetaContent');
            if (!currentMetaContent) {
                console.error('Current Meta content not loaded');
                if (matchupsSection) matchupsSection.classList.add('d-none');
                return;
            }
            
            // Find all h3 elements (deck names) and locate the one matching our archetype
            const allH3 = currentMetaContent.querySelectorAll('h3');
            let matchingSection = null;
            
            const cleanArchForH3 = stripExSuffix(archetype);
            for (let h3 of allH3) {
                const h3Text = h3.textContent.trim();
                // Check if h3 starts with the archetype name (try both original and stripped)
                if (h3Text.startsWith(archetype + ' ') || h3Text.startsWith(cleanArchForH3 + ' ')) {
                    // Found it! The parent div contains the matchup tables
                    matchingSection = h3.parentElement;
                    devLog(`? Found HTML section for: ${archetype}`);
                    break;
                }
            }
            
            if (!matchingSection) {
                // CSV fallback — the preloaded Current-Meta HTML only contains
                // the top decks, so picking a low-share archetype (e.g.
                // Archaludon Dudunsparce at rank 57) leaves the matchups
                // block hidden even though the data exists in
                // limitless_online_decks_matchups.csv. Build the block
                // directly from window.currentMetaMatchupData here.
                if (renderMatchupsFromCSVFallback(archetype, matchupsSection, bestTable, worstTable, titleEl)) {
                    devLog(`Rendered matchups via CSV fallback for: ${archetype}`);
                    return;
                }
                console.error(`No HTML matchup section + CSV fallback failed for: ${archetype}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            // Extract the Best and Worst Matchups tables directly from HTML
            // (Look for .matchups-grid-container class OR inline grid style)
            let tablesGrid = matchingSection.querySelector('.matchups-grid-container');
            if (!tablesGrid) {
                tablesGrid = matchingSection.querySelector('div[style*="grid-template-columns"]');
            }
            if (!tablesGrid) {
                console.error(`? No matchup tables found in section for: ${archetype}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            const allTablesInGrid = tablesGrid.querySelectorAll('table');
            if (allTablesInGrid.length < 2) {
                console.error(`? Expected 2 tables (best/worst), found: ${allTablesInGrid.length}`);
                matchupsSection.classList.add('d-none');
                return;
            }
            
            const bestMatchupsTable = allTablesInGrid[0]; // First table = Best Matchups
            const worstMatchupsTable = allTablesInGrid[1]; // Second table = Worst Matchups
            
            devLog(`? Extracted matchup tables from HTML for: ${archetype}`);
            
            // Extract title from H3 (already contains all info: "Gholdengo Lunatone (Rank #2 | Total WR: 52.2%, Vs Top20: 15:4)")
            const h3El = matchingSection.querySelector('h3');
            if (h3El) {
                titleEl.innerHTML = h3El.innerHTML; // Copy title exactly 1:1
            }
            
            // Copy table body rows directly from HTML (1:1 same data as Current Meta Tab)
            const bestTbody = bestMatchupsTable.querySelector('tbody');
            const worstTbody = worstMatchupsTable.querySelector('tbody');
            
            // Strip the "(N games)" suffix from the Record cell so the
            // column reads as a clean W-L-T tuple. The Python scraper
            // emits "<td>54 - 22 - 0 (76 games)</td>" — the (76 games)
            // part is redundant (sum of W+L+T) and crowds the narrow
            // mobile column. Match the literal " (N games)" tail with
            // a regex on the row's outerHTML so we don't have to walk
            // the DOM per row.
            const _stripGamesSuffix = (html) =>
                html.replace(/\s*\(\d+\s*games\)/gi, '');

            if (bestTbody) {
                // Copy all <tr> rows except the header row
                const bestRows = Array.from(bestMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let bestHtml = '';
                bestRows.forEach(row => {
                    bestHtml += _stripGamesSuffix(row.outerHTML);
                });
                bestTable.innerHTML = bestHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            } else {
                bestTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            }

            if (worstTbody) {
                // Copy all <tr> rows except the header row
                const worstRows = Array.from(worstMatchupsTable.querySelectorAll('tr')).slice(1); // Skip header
                let worstHtml = '';
                worstRows.forEach(row => {
                    worstHtml += _stripGamesSuffix(row.outerHTML);
                });
                worstTable.innerHTML = worstHtml || '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            } else {
                worstTable.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">' + t('heatmap.noData') + '</td></tr>';
            }
            
            // Populate opponent dropdown from window.matchupData (for search feature)
            // Try stripped name first (Limitless uses "Ceruledge", dropdown may have "Ceruledge Ex")
            const cleanArchForVar = stripExSuffix(archetype);
            const deckNameForVar = cleanArchForVar.replace(/\s+/g, '_').replace(/'/g, '');
            const varName = 'matchupData_' + deckNameForVar;
            let matchupData = window[varName];
            // Fallback: try original archetype name in case data uses the Ex variant
            if (!matchupData) {
                const fallbackVar = 'matchupData_' + archetype.replace(/\s+/g, '_').replace(/'/g, '');
                matchupData = window[fallbackVar];
            }
            
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            if (matchupData) {
                const allOpponents = Object.keys(matchupData).filter(o => o).sort();
                let dropdownHtml = '';
                allOpponents.forEach(opponent => {
                    dropdownHtml += `<div class="opponent-option" data-value="${opponent}" onclick="selectCurrentMetaOpponent(this, '${opponent}')" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;">${opponent}</div>`;
                });
                dropdown.innerHTML = dropdownHtml;
                
                // Store for filtering
                window.currentMetaDeckMatchups = Object.entries(matchupData).map(([opponent, data]) => ({
                    opponent: opponent,
                    win_rate: data.win_rate,
                    win_rate_numeric: data.win_rate_numeric,
                    record: data.record,
                    total_games: data.total_games
                }));
            } else {
                dropdown.innerHTML = '<div style="padding: 10px; color: #444; font-weight: 500;">' + t('heatmap.noData') + '</div>';
                window.currentMetaDeckMatchups = [];
            }
            
            matchupsSection.classList.remove('d-none');
        }
        
        // Filter opponents in dropdown
        function filterCurrentMetaOpponents(inputEl) {
            const searchValue = inputEl.value.toLowerCase();
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const options = dropdown.querySelectorAll('.opponent-option');
            
            let hasVisibleOptions = false;
            options.forEach(option => {
                const opponentName = option.getAttribute('data-value').toLowerCase();
                if (opponentName.includes(searchValue)) {
                    option.classList.remove('d-none');
                    hasVisibleOptions = true;
                } else {
                    option.classList.add('d-none');
                }
            });

            if (hasVisibleOptions) {
                dropdown.classList.remove('d-none');
            } else {
                dropdown.classList.add('d-none');
            }
        }
        
        // Select opponent and show matchup details
        function selectCurrentMetaOpponent(optionEl, opponent) {
            const inputEl = document.getElementById('currentMetaOpponentSearch');
            const hiddenEl = document.getElementById('currentMetaOpponentSelected');
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const detailsEl = document.getElementById('currentMetaMatchupDetails');
            
            // Update input and hidden field
            inputEl.value = opponent;
            hiddenEl.value = opponent;
            dropdown.classList.add('d-none');
            
            // Find matchup data
            const deckMatchups = window.currentMetaDeckMatchups || [];
            const matchup = deckMatchups.find(m => m.opponent === opponent);
            
            if (matchup) {
                const winRate = matchup.win_rate || '-';
                const record = matchup.record || '-';
                const totalGames = matchup.total_games || '0';
                
                detailsEl.innerHTML = `
                    <h4 style="margin-top: 0; color: #2c3e50;">Matchup: vs ${escapeHtml(opponent)}</h4>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 10px;">
                        <div>
                            <strong style="color: #333;">Win Rate:</strong><br>
                            <span style="font-size: 1.5em; color: #3498db;">${escapeHtml(winRate)}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Record:</strong><br>
                            <span style="font-size: 1.2em; color: #2c3e50;">${escapeHtml(record)}</span>
                        </div>
                        <div>
                            <strong style="color: #333;">Total Games:</strong><br>
                            <span style="font-size: 1.5em; color: #2c3e50;">${escapeHtml(totalGames)}</span>
                        </div>
                    </div>
                `;
                detailsEl.classList.remove('d-none');
            } else {
                detailsEl.innerHTML = '<p style="color: #444; text-align: center; font-weight: 500;">No matchup data found</p>';
                detailsEl.classList.remove('d-none');
            }
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.getElementById('currentMetaOpponentDropdown');
            const input = document.getElementById('currentMetaOpponentSearch');
            if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        });
        
        function applyCurrentMetaFilter() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            const archetype = document.getElementById('currentMetaDeckSelect')?.value;
            
            if (!filterSelect || !archetype || !window.currentCurrentMetaDeckCards) return;
            
            const filterValue = filterSelect.value;
            const allCards = window.currentCurrentMetaDeckCards;
            const filteredCards = applyShareFilterWithAceSpecBoost(allCards, filterValue);
            
            devLog(`Filter applied: ${filterValue}, showing ${filteredCards.length} of ${allCards.length} cards`);
            
            const filteredTotal = filteredCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            const allTotal = allCards.reduce((sum, card) => sum + parseInt(card.max_count || 0), 0);
            
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            const gridViewContainer = document.getElementById('currentMetaDeckVisual');
            // Active view = the one NOT hidden; default to grid when both are hidden
            const isTableViewActive = tableViewContainer && !tableViewContainer.classList.contains('d-none');
            
            if (isTableViewActive) {
                renderCurrentMetaDeckTable(filteredCards);
            } else {
                renderCurrentMetaDeckGrid(filteredCards);
            }

            if (gridViewContainer && !isTableViewActive) {
                gridViewContainer.classList.remove('d-none');
            }
            if (tableViewContainer && isTableViewActive) {
                tableViewContainer.classList.remove('d-none');
            }
            
            updateCurrentMetaCardCounts(filteredCards.length, filteredTotal, allTotal);
        }
        
        function updateCurrentMetaCardCounts(uniqueCount, filteredTotal, allTotal) {
            const countEl = document.getElementById('currentMetaCardCount');
            const summaryEl = document.getElementById('currentMetaCardCountSummary');
            
            if (countEl) countEl.textContent = `${uniqueCount} ${t('deck.cards')}`;
            if (summaryEl) summaryEl.textContent = `/ ${filteredTotal} Total`;
        }
        
        // Set overview rarity mode
        function setCurrentMetaOverviewRarityMode(mode) {
            devLog('Setting Current Meta overview rarity mode to:', mode);
            currentMetaRarityMode = mode;
            
            if (mode === 'all') {
                currentMetaGlobalRarityPreference = null;
                globalRarityPreference = null;
            } else {
                currentMetaGlobalRarityPreference = mode;
                globalRarityPreference = mode;
            }
            
            // Update button styles with null-checks
            const btnMin = document.getElementById('currentMetaOverviewRarityMin');
            const btnMax = document.getElementById('currentMetaOverviewRarityMax');
            const btnAll = document.getElementById('currentMetaOverviewRarityAll');
            
            if (btnMin) {
                btnMin.classList.remove('btn-active', 'btn-inactive');
                btnMin.classList.add(mode === 'min' ? 'btn-active' : 'btn-inactive');
            }
            if (btnMax) {
                btnMax.classList.remove('btn-active', 'btn-inactive');
                btnMax.classList.add(mode === 'max' ? 'btn-active' : 'btn-inactive');
            }
            if (btnAll) {
                btnAll.classList.remove('btn-active', 'btn-inactive');
                btnAll.classList.add(mode === 'all' ? 'btn-active' : 'btn-inactive');
            }
            
            const cards = window.currentCurrentMetaDeckCards;
            if (cards && cards.length > 0) {
                applyCurrentMetaFilter();  // Use filter function to preserve percentage filter
            } else {
                console.warn('No cards available to render - mode saved for when deck is selected');
            }
            
            if (window.currentMetaDeck && Object.keys(window.currentMetaDeck).length > 0) {
                updateDeckDisplay('currentMeta');
            }
        }
        
        // Global helper function to determine card type for filtering and sorting
        function getCardType(name, set, number) {
            // Try to get card from database first
            if (set && number) {
                const dbCard = getCanonicalCardRecord(set, number) || null;
                
                if (dbCard && dbCard.type) {
                    const dbType = dbCard.type;
                    
                    // Map database type to display category
                    // Energy types
                    if (dbType === 'Basic Energy' || dbType === 'Special Energy') {
                        return 'Energy';
                    }
                    
                    // Trainer types - exact match
                    if (dbType === 'Supporter') return 'Supporter';
                    if (dbType === 'Stadium') return 'Stadium';
                    
                    // Item and Tool - check for Ace Spec first
                    if (dbType === 'Item' || dbType === 'Tool' || dbType === 'Item/Technical Machine') {
                        if (isAceSpec(name)) return 'Ace Spec';
                        if (dbType === 'Tool' || dbType === 'Item/Technical Machine') return 'Tool';
                        return 'Item';
                    }
                    
                    // Pokemon types (any type starting with element: G Basic, R Stage 1, W Stage 2, etc.)
                    return 'Pokemon';
                }
            }
            
            // FALLBACK: If card not in database, use name-based detection
            console.warn(`[getCardType] Card not found in database: ${name} (${set} ${number}), using fallback detection`);
            
            // 1. Check if it's energy
            if (isBasicEnergy(name)) return 'Energy';
            if (name.includes('Energy')) return 'Energy';
            
            // 2. Check for Ace Spec (special items - highest priority)
            if (isAceSpec(name)) return 'Ace Spec';
            
            // 3. Check for Tools (Pokemon Tools attached to Pokemon)
            if (['Balloon', 'Belt', 'Cape', 'Charm', 'Band', 'Guard', 'Helmet', 
                 'Glasses', 'Shard', 'Stone'].some(t => name.includes(t))) {
                return 'Tool';
            }
            
            // 4. Check for Stadiums
            if (['Stadium', 'Tower', 'Watchtower', 'Path', 'Temple', 'Forest', 'Mountain', 
                 'Beach', 'Town', 'Hall', 'Garden', 'Ruins', 'Lake', 'Crater'].some(t => name.includes(t))) {
                return 'Stadium';
            }
            
            // 5. Check for Supporters
            if (name.includes("'s ") || 
                ['Professor', 'Arven', 'Iono', 'Judge', 'Cynthia', 'Marnie', 'Irida', 'Carmine', 
                 'Penny', 'Colress', 'Raihan', 'Tulip', 'Grusha', 'Larry', 'Kieran'].some(t => name.includes(t))) {
                return 'Supporter';
            }
            
            // 6. Check for Items
            if (['Ball', 'Pad', 'Rod', 'Cart', 'Poffin', 'Nest', 'Candy', 'Switch',
                 'Stretcher', 'Letter', 'Bike', 'Scooter', 'Scoop', 'Gong', 'Device', 
                 'Container', 'Scrapper', 'Deck', 'Doll', 'Fossil', 'Potion', 'Mail',
                 'Premium Power Pro', 'Escape Rope', 'Max Elixir'].some(t => name.includes(t))) {
                return 'Item';
            }
            
            // 7. Check for Pokemon with ex/GX/V suffix
            if (/\s(ex|GX|V|VMAX|VSTAR|BREAK)$/i.test(name)) {
                return 'Pokemon';
            }
            
            // 8. Default: assume Pokemon
            return 'Pokemon';
        }
        
        // Render grid view
        function renderCurrentMetaDeckGrid(cards) {
            const visualContainer = document.getElementById('currentMetaDeckVisual');
            const gridContainer = document.getElementById('currentMetaDeckGrid');
            if (!gridContainer) return;

            if (!Array.isArray(cards) || cards.length === 0) {
                gridContainer.innerHTML = getEmptyStateHtml();
                if (visualContainer) {
                    document.getElementById('currentMetaDeckTableView')?.classList.add('d-none');
                    visualContainer.classList.remove('d-none');
                }
                return;
            }
            
            const sortedCards = sortCardsByType([...cards]);
            const currentDeck = window.currentMetaDeck || {};
            const priceMap = getOverviewPriceLookupCache();

            // Decklist Skeleton activation flag — same gating logic as the
            // City League Card Overview: bucket only when ONE archetype is
            // selected, since cross-archetype % values aren't comparable.
            const selectedArchForSkeleton = String(window.currentMetaArchetype || '').trim();
            const useSkeletonLayout = selectedArchForSkeleton && selectedArchForSkeleton !== 'all';
            const SKELETON_MAIN_MIN  = 85;
            const SKELETON_NICHE_MAX = 50;
            // Titel des Anteilsbands. Steht einmal hier statt in jeder
            // Kartenzeile — 60 Karten mal derselbe String.
            const USAGE_TITLE = (typeof t === 'function' && t('cl.usageBarTitle'))
                || (typeof getLang === 'function' && getLang() === 'en'
                    ? 'of the analysed lists play this card'
                    : 'der ausgewerteten Listen spielen diese Karte');

            const cardHtmls = [];
            sortedCards.forEach(card => {
                const originalSetCode = card.set_code || '';
                const originalSetNumber = card.set_number || '';
                const rawCardName = card.card_name || '';
                const cardName = getDisplayCardName(rawCardName, originalSetCode, originalSetNumber);
                const cardNameEscaped = escapeJsStr(cardName);
                
                let versionsToRender = [];
                
                if (currentMetaRarityMode === 'all') {
                    let allVersions = getInternationalPrintsForCard(originalSetCode, originalSetNumber);
                    if (allVersions && allVersions.length > 0) {
                        versionsToRender = allVersions.map(v => ({
                            ...card,
                            set_code: v.set,
                            set_number: v.number,
                            image_url: v.image_url,
                            rarity: v.rarity
                        }));
                    } else {
                        versionsToRender = [card];
                    }
                } else {
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    if (preferredVersion) {
                        versionsToRender = [{
                            ...card,
                            set_code: preferredVersion.set,
                            set_number: preferredVersion.number,
                            image_url: preferredVersion.image_url,
                            rarity: preferredVersion.rarity
                        }];
                    } else {
                        versionsToRender = [card];
                    }
                }
                
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
                    const finalMaxCount = rawMaxCount > 0
                        ? Math.min(legalMaxCopies, rawMaxCount)
                        : 0;
                    
                    let deckCount = 0;
                    if (Object.keys(currentDeck).length > 0 && setCode && setNumber) {
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match) {
                                if (match[1] === setCode && match[2] === setNumber) {
                                    deckCount = currentDeck[deckKey] || 0;
                                    break;
                                }
                            }
                        }
                    } else if (Object.keys(currentDeck).length > 0 && !setCode && !setNumber) {
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    const totalDecksInArchetype = safeParseFloat(card.total_decks_in_archetype || 0);
                    const avgCountOverallRaw = safeParseFloat(card.average_count_overall || '', NaN);
                    const avgCountInUsedRaw = safeParseFloat(card.average_count || card.avg_count || '', NaN);

                    const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                        ? rawPercentage
                        : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                    const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                        ? avgCountOverallRaw
                        : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);
                    const avgCountInUsedValueRaw = Number.isFinite(avgCountInUsedRaw) && avgCountInUsedRaw > 0
                        ? avgCountInUsedRaw
                        : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);

                    // Phase-6 PR1 (Fix E / AC5) — if Consistency Generate ran
                    // and produced an effective avg for this card (e.g. ACE-
                    // SPEC-conditional override on top of the baseline merge),
                    // show THAT value as the primary Ø so display matches
                    // what Math.round actually used to pick the deck count.
                    // The baseline combined-merge avg becomes a secondary
                    // info shown next to the primary.
                    const _effEntry = (window.__effectiveAvgMap && window.__effectiveAvgMap['currentMeta'])
                        ? window.__effectiveAvgMap['currentMeta'][String(cardName || '').toLowerCase()]
                        : null;
                    const avgCountInUsedValue = _effEntry && Number.isFinite(_effEntry.effective)
                        ? _effEntry.effective
                        : avgCountInUsedValueRaw;
                    const _baselineDisplay = _effEntry && Number.isFinite(_effEntry.baseline)
                        ? _effEntry.baseline
                        : avgCountInUsedValueRaw;
                    const _hasOverride = _effEntry
                        && Number.isFinite(_effEntry.effective)
                        && Math.abs(_effEntry.effective - _baselineDisplay) >= 0.15;

                    const finalAvgUsed = Math.min(legalMaxCopies, avgCountInUsedValue);
                    const finalAvgOverall = Math.min(legalMaxCopies, avgCountOverallValue);
                    const finalAvgBaseline = Math.min(legalMaxCopies, _baselineDisplay);
                    const maxCount = finalMaxCount;

                    // Defensive 100 % cap mirrors the data-merge cap so a
                    // stray row with deck_count > total_decks_in_archetype
                    // can never render as e.g. 117 % on the card overview.
                    const percentage = Math.min(100, Math.max(0, resolvedPercentage)).toFixed(1).replace('.', ',');
                    const avgCountOverall = Math.max(0, finalAvgOverall).toFixed(2).replace('.', ',');
                    const avgCountInUsedDecks = Math.max(0, finalAvgUsed).toFixed(2).replace('.', ',');
                    const avgCountBaselineDisplay = Math.max(0, finalAvgBaseline).toFixed(2).replace('.', ',');
                    const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                    const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                    
                    // Price lookup
                    let eurPrice = '';
                    let cardmarketUrl = '';
                    let germanCardName = (displayCard.name_de || card.name_de || card.card_name_de || '').toLowerCase();
                    if (setCode && setNumber) {
                        const normalizedSet = normalizeSetCode(setCode);
                        const normalizedNumber = normalizeCardNumber(setNumber);
                        let priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber}`);
                        if (!priceCard && /^\d+$/.test(normalizedNumber)) {
                            priceCard = priceMap.get(`${normalizedSet}-${normalizedNumber.padStart(3, '0')}`);
                        }
                        if (priceCard) {
                            eurPrice = priceCard.eur_price || '';
                            cardmarketUrl = priceCard.cardmarket_url || '';
                            if (priceCard.name_de) germanCardName = String(priceCard.name_de).toLowerCase();
                        }
                    }
                    const isBasicEnergyEntry = (typeof isBasicEnergyCardEntry === 'function' && isBasicEnergyCardEntry({
                        card_name: cardName,
                        type: card.type || card.card_type,
                        supertype: card.supertype,
                        subtypes: card.subtypes
                    })) || /basic energy/i.test(String(card.type || card.card_type || ''));

                    if (isBasicEnergyEntry) {
                        eurPrice = '0,05€';
                        cardmarketUrl = '';
                    }
                    const priceDisplay = eurPrice || '0,00€';
                    const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                    const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                    
                    // Card type category
                    const cardType = card.type || card.card_type || '';
                    const cardCategory = getCardTypeCategory(cardType);
                    const isAceSpecCard = isAceSpec(cardName);
                    const filterCategory = isAceSpecCard ? 'Ace Spec' : cardCategory;
                    const germanCardNameEscaped = germanCardName.replace(/"/g, '&quot;');
                    
                    // Collection badge
                    const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber);
                    const otherPrintSparkleHtml = otherPrintOwnedCount > 0
                        ? `<div class="city-league-other-print-sparkle${deckCount > 0 ? ' city-league-other-print-sparkle-hasdeck' : ''}" title="Owned other INT prints: ${otherPrintOwnedCount}x">
                            <span class="city-league-other-print-sparkle-icon"></span>
                            <span class="city-league-other-print-sparkle-count">${otherPrintOwnedCount}</span>
                        </div>`
                        : '';
                    
                    // Coloured usage bar overlay — only in skeleton mode.
                    const usagePct = Math.max(0, Math.min(100, resolvedPercentage || 0));
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

                    const isPinned = (typeof isPinnedCard === 'function') && isPinnedCard('currentMeta', cardName);
                    const pinnedClass = isPinned ? ' card-is-pinned' : '';
                    const pinTitle = isPinned
                        ? (t('deck.pinTitleUnpin') || 'Unpin')
                        : (t('deck.pinTitlePin') || 'Pin');
                    const pinIcon = isPinned ? '📌' : '📍';
                    const pinBadgeHtml = isPinned
                        ? `<div class="deck-card-pin-badge cm-deep-dive-only" title="${pinTitle}">📌</div>`
                        : '';

                    const isExcluded = (typeof isExcludedCard === 'function') && isExcludedCard('currentMeta', cardName);
                    const excludedClass = isExcluded ? ' card-is-excluded' : '';
                    const excludeTitle = isExcluded
                        ? (t('deck.excludeTitleUnexclude') || 'Un-exclude — let the algorithm consider this card again')
                        : (t('deck.excludeTitleExclude') || 'Exclude — keep this card out of the next Consistency Generate');
                    const excludeIcon = isExcluded ? '⛔' : '🚫';
                    const excludeBadgeHtml = isExcluded
                        ? `<div class="deck-card-exclude-badge cm-deep-dive-only" title="${excludeTitle}">⛔</div>`
                        : '';

                    cardHtmls.push({ pct: usagePct, isAceSpec: isAceSpecCard, html: `
                        <div class="card-item city-league-card-item${pinnedClass}${excludedClass}" data-card-name="${cardName.toLowerCase()}" data-card-name-de="${germanCardNameEscaped}" data-card-set="${setCode.toLowerCase()}" data-card-number="${setNumber.toLowerCase()}" data-card-type="${filterCategory}">
                            <div class="card-image-container city-league-card-image-container">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" class="city-league-card-image" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                                ${usageBarHtml}
                                <div class="city-league-card-badge city-league-card-badge-max">${maxCount}</div>
                                ${pinBadgeHtml}
                                ${excludeBadgeHtml}
                                ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                                ${deckCount > 0 ? `<div class="city-league-card-badge city-league-card-badge-deck">${deckCount}</div>` : ''}
                                ${otherPrintSparkleHtml}
                                <div class="card-info-bottom city-league-card-info-bottom">
                                    <div class="card-info-text city-league-card-info-text">
                                        <div class="city-league-card-title-mobile">${cardName}${cardNameWarning}</div>
                                        <div class="city-league-card-set-stats-row"><div class="city-league-card-set-mobile">${setCode} ${setNumber}</div>${resolvedPercentage > 0 ? `<div class="city-league-card-stats-mobile">${percentage}%</div>` : ''}</div>
                                        ${resolvedPercentage > 0 ? (
                                            _hasOverride
                                                ? `<div class="city-league-card-avg-mobile" title="Algorithm uses Ø ${avgCountInUsedDecks}x for this card (${_effEntry && _effEntry.overrideReason || 'override'}). Baseline cross-meta average: ${avgCountBaselineDisplay}x.">Ø ${avgCountInUsedDecks}x <span style="opacity:0.7;font-size:0.85em;">(base ${avgCountBaselineDisplay}x)</span></div>`
                                                : `<div class="city-league-card-avg-mobile">Ø ${avgCountInUsedDecks}x (${avgCountOverall}x)</div>`
                                        ) : ''}
                                        <div class="city-league-card-deck-stats-mobile">${decksWithCardDisplay}/${totalDecksDisplay} (${percentage}%)</div>
                                    </div>
                                    <div class="card-action-buttons city-league-card-action-buttons">
                                        <div class="city-league-card-action-row">
                                            <button class="city-league-card-action-btn city-league-card-remove-btn" onclick="event.stopPropagation(); removeCardFromDeck('currentMeta', '${cardNameEscaped}')" title="${t('cl.removeFromDeck')}">-</button>
                                            <button class="city-league-card-action-btn city-league-card-add-btn" onclick="event.stopPropagation(); addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')" title="${t('cl.addToDeckTooltip')}">+</button>
                                            <button class="city-league-card-action-btn city-league-card-rarity-btn" onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped} (${setCode} ${setNumber})')" title="${t('cl.switchPrint')}">★</button>
                                        </div>
                                        <div class="city-league-card-action-row">
                                            ${setCode && setNumber ? `<button class="city-league-card-action-btn city-league-card-limitless-btn" onclick="event.stopPropagation(); openLimitlessCard('${setCode}', '${setNumber}')" title="${t('cl.openLimitless')}">L</button>` : '<span></span>'}
                                            <button class="city-league-card-action-btn city-league-card-proxy-btn" onclick="event.stopPropagation(); addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" title="${t('cl.proxyTooltip')}">P</button>
                                            <button class="city-league-card-action-btn city-league-card-market-btn" onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" data-market-bg="${priceBackground}" data-market-cursor="${eurPrice ? 'pointer' : 'not-allowed'}" title="${eurPrice ? t('cl.buyCardmarket') + ' ' + eurPrice : t('cl.priceNA')}">${priceDisplay}</button>
                                        </div>
                                        <!-- Cooking-mode-only row: pin (force into next build) + exclude
                                             (keep out of next build). Hidden in vanilla via .cm-deep-dive-only
                                             so the standard view stays at two action rows. -->
                                        <div class="city-league-card-action-row cm-deep-dive-only">
                                            <button class="city-league-card-action-btn city-league-card-pin-btn${isPinned ? ' is-active' : ''}" onclick="event.stopPropagation(); togglePinCard('currentMeta', '${cardNameEscaped}')" title="${pinTitle}">${pinIcon}</button>
                                            <button class="city-league-card-action-btn city-league-card-exclude-btn${isExcluded ? ' is-active' : ''}" onclick="event.stopPropagation(); toggleExcludeCard('currentMeta', '${cardNameEscaped}')" title="${excludeTitle}">${excludeIcon}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                ` });
                });
            });

            // ── Render path ───────────────────────────────────────────
            // Without skeleton: existing flat batch render. With skeleton:
            // bucket already-rendered HTML by usage % into Main / Options /
            // Niche sections. Same HTML strings, no re-render.
            const renderGen = ++_currentMetaRenderGen;
            const BATCH_SIZE = 12;

            if (!useSkeletonLayout) {
                const flatHtmls = cardHtmls.map(c => c.html);
                gridContainer.innerHTML = flatHtmls.slice(0, BATCH_SIZE).join('');
                if (flatHtmls.length > BATCH_SIZE) {
                    let offset = BATCH_SIZE;
                    (function renderNextBatch() {
                        if (renderGen !== _currentMetaRenderGen) return;
                        if (offset >= flatHtmls.length) return;
                        const batch = flatHtmls.slice(offset, offset + BATCH_SIZE);
                        gridContainer.insertAdjacentHTML('beforeend', batch.join(''));
                        offset += BATCH_SIZE;
                        requestAnimationFrame(renderNextBatch);
                    })();
                }
            } else {
                // Same bucketing as City League — Ace Spec gets the
                // ranked-override (1st = Main, 2nd/3rd = Options, rest =
                // Niche) since only one Ace Spec is legal per deck so
                // the usual %-cutoffs are misleading for that card type.
                const aceCards = cardHtmls.filter(c => c.isAceSpec);
                const aceSorted = [...aceCards].sort((a, b) => b.pct - a.pct);
                const aceMainSet    = new Set(aceSorted.slice(0, 1));
                const aceOptionsSet = new Set(aceSorted.slice(1, 3));

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
            document.getElementById('currentMetaDeckTableView')?.classList.add('d-none');
            visualContainer.classList.remove('d-none');
        }
        
        function renderCurrentMetaDeckTable(cards) {
            const tableContainer = document.getElementById('currentMetaDeckTable');
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            if (!tableContainer) return;
            
            // Group cards into FOUR tiers: Check Ace Spec FIRST, then by usage percentage
            const coreCards = [];
            const aceSpecCards = [];
            const techCards = [];
            const spicyCards = [];
            
            // Hardcoded Ace Spec names for reliable detection (CSV is_ace_spec is buggy)
            const _aceSpecNamesMeta = ['prime catcher','unfair stamp','master ball','maximum belt','hero\'s cape','awakening drum','reboot pod','survival brace','grand tree','neutral center','sparkling crystal','dangerous laser','scoop up cyclone','computer search','dowsing machine','rock guard','life dew','victory star','g booster','g scope','rich energy','legacy energy','secret box','hyper aroma','neo upper energy','scramble switch','deluxe bomb','megaton blower','amulet of hope','pok\u00e9 vital a'];
            cards.forEach(card => {
                // Check if card is Ace Spec (exclusive category)
                const _cn = String(card.card_name || card.name || '').trim().toLowerCase();
                const isAceSpec = _aceSpecNamesMeta.includes(_cn) ||
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
            
            const currentDeck = window.currentMetaDeck || {};
            
            // Helper function to render a single tier
            const renderTier = (tierCards, tierTitle, tierEmoji) => {
                if (tierCards.length === 0) return '';
                
                let html = `<div style="margin-bottom: 30px;">`;
                html += `<h3 style="margin: 20px 0 15px 0; color: #2c3e50; font-size: 1.3em; display: flex; align-items: center; gap: 10px;"><span>${tierEmoji}</span> ${tierTitle}</h3>`;
                html += '<div style="display: flex; flex-direction: column; gap: 15px;">';
                
                tierCards.forEach(card => {
                    const cardName = card.card_name;
                    let displayCard = card;
                    const allCards = window.allCardsDatabase || [];
                    const allVersions = allCards.filter(c => (c.name_en || c.name) === cardName && c.set && c.number);
                    
                    if (currentMetaRarityMode !== 'all' && allVersions.length > 0) {
                        // Set order loaded from sets.json at startup (higher = newer)
                        const SET_ORDER = window.setOrderMap || {};
                        
                        const getRarityValue = (card) => {
                            const r = (card.rarity || card.card_rarity || '').toLowerCase();
                            if (!r || r === '') return 0;
                            if (r.includes('common')) return 1;
                            if (r.includes('uncommon')) return 2;
                            if (r.includes('rare')) return 3;
                            return -1;
                        };
                        
                        allVersions.sort((a, b) => {
                            const rarityDiff = currentMetaRarityMode === 'min' ? getRarityValue(a) - getRarityValue(b) : getRarityValue(b) - getRarityValue(a);
                            if (rarityDiff !== 0) return rarityDiff;
                            return (SET_ORDER[b.set] || 0) - (SET_ORDER[a.set] || 0);
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
                    const rawPercentage = parseLocaleNumber(card.percentage_in_archetype || card.share_percent || 0, 0);
                    const maxCount = parseInt(card.max_count) || card.max_count || '?';
                    const cardNameEscaped = escapeJsStr(cardName);
                    const setCode = displayCard.set_code || '';
                    const setNumber = displayCard.set_number || '';
                    const avgCountUsedRaw = parseLocaleNumber(card.average_count || card.avg_count || 0, 0);
                    
                    let deckCount = 0;
                    if (setCode && setNumber) {
                        for (const deckKey in currentDeck) {
                            const match = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                            if (match && match[1] === setCode && match[2] === setNumber) {
                                deckCount = currentDeck[deckKey] || 0;
                                break;
                            }
                        }
                    } else {
                        deckCount = currentDeck[cardName] || 0;
                    }
                    
                    const decksWithCard = parseLocaleNumber(card.deck_count || card.deck_inclusion_count || 0, 0);
                    const totalDecksInArchetype = parseLocaleNumber(card.total_decks_in_archetype || 0, 0);
                    const totalCount = parseLocaleNumber(card.total_count || 0, 0);
                    const avgCountOverallRaw = parseLocaleNumber(card.average_count_overall || 0, 0);

                    const resolvedPercentage = Number.isFinite(rawPercentage) && rawPercentage > 0
                        ? rawPercentage
                        : (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0);
                    const avgCountUsedValue = Number.isFinite(avgCountUsedRaw) && avgCountUsedRaw > 0
                        ? avgCountUsedRaw
                        : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);
                    const avgCountOverallValue = Number.isFinite(avgCountOverallRaw) && avgCountOverallRaw > 0
                        ? avgCountOverallRaw
                        : (totalDecksInArchetype > 0 ? (totalCount / totalDecksInArchetype) : 0);

                    const percentage = Math.min(100, Math.max(0, resolvedPercentage)).toFixed(1).replace('.', ',');
                    const avgCount = Math.max(0, avgCountUsedValue).toFixed(2).replace('.', ',');
                    const avgCountOverall = Math.max(0, avgCountOverallValue).toFixed(2).replace('.', ',');
                    const decksWithCardDisplay = Math.round(Math.max(0, decksWithCard));
                    const totalDecksDisplay = Math.round(Math.max(0, totalDecksInArchetype));
                
                    html += `
                        <div class="card-table-row" data-card-name="${cardName.toLowerCase()}" style="display: flex; align-items: center; background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); gap: 20px;">
                            <div style="flex-shrink: 0; position: relative; width: 120px;">
                                <img src="${imageUrl}" alt="${cardName}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; border-radius: 6px; cursor: zoom-in; aspect-ratio: 2.5/3.5; object-fit: cover;" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped} (${setCode} ${setNumber})');">
                                ${deckCount > 0 ? `<div style="position: absolute; top: 5px; left: 5px; background: #28a745; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85em; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${deckCount}</div>` : ''}
                                ${typeof getWishlistBadgeHtml === 'function' ? getWishlistBadgeHtml(cardName, setCode, setNumber) : ''}
                            </div>
                            <div style="flex-grow: 1; min-width: 0;">
                                <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #333;">${cardName}</h3>
                                <div style="color: #333; font-size: 0.9em; margin-bottom: 10px; font-weight: 600;">${setCode} ${setNumber}</div>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 10px;">
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Usage Share:</span> <span style="font-weight: 600; color: #667eea; margin-left: 5px;">${percentage}%</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø Count (if used):</span> <span style="font-weight: 600; color: #27ae60; margin-left: 5px;">${avgCount}x</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Ø Count (overall):</span> <span style="font-weight: 600; color: #f39c12; margin-left: 5px;">${avgCountOverall}x</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Deck Count:</span> <span style="font-weight: 600; color: #333; margin-left: 5px;">${decksWithCardDisplay} / ${totalDecksDisplay}</span></div>
                                    <div><span style="color: #555; font-size: 0.85em; font-weight: 600;">Max Count:</span> <span style="font-weight: 600; color: #dc3545; margin-left: 5px;">${maxCount}</span></div>
                                </div>
                            </div>
                            <div style="flex-shrink: 0; display:flex; flex-direction:column; gap:6px;">
                                <button class="btn btn-success" style="padding: 10px 20px; font-size: 0.95em;" onclick="addCardToDeck('currentMeta', '${cardNameEscaped}', '${setCode}', '${setNumber}')">Add to Deck</button>
                                <button class="btn" style="padding: 10px 20px; font-size: 0.85em; background:#e74c3c; color:white;" onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)">Proxy</button>
                            </div>
                        </div>
                    `;
                });
                
                html += '</div></div>';
                return html;
            };
            
            // Render all FOUR tiers
            let html = '';
            html += renderTier(coreCards, 'Core Cards (80% - 100%)', '');
            html += renderTier(aceSpecCards, 'Ace Spec (Max 1 per Deck)', '');
            html += renderTier(techCards, 'Tech Cards (15% - 79%)', '');
            html += renderTier(spicyCards, 'Spicy Techs (< 15%)', '');
            
            if (html === '') {
                html = '<p style="text-align: center; padding: 20px; color: #444;">No cards found</p>';
            }
            
            tableContainer.innerHTML = html;
            document.getElementById('currentMetaDeckVisual')?.classList.add('d-none');
            tableViewContainer.classList.remove('d-none');
            devLog('Current Meta table rendered with tier grouping:', { core: coreCards.length, aceSpec: aceSpecCards.length, tech: techCards.length, spicy: spicyCards.length });
        }
        
        function filterCurrentMetaOverviewCards() {
            const searchInput = document.getElementById('currentMetaOverviewSearch');
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById('currentMetaDeckGrid');
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.card-item');
            let visibleCount = 0;
            
            cards.forEach(card => {
                const cardName = card.getAttribute('data-card-name') || '';
                const cardNameDe = card.getAttribute('data-card-name-de') || '';
                const cardType = card.getAttribute('data-card-type') || '';
                const cardSet = card.getAttribute('data-card-set') || '';
                const cardNumber = card.getAttribute('data-card-number') || '';

                // Check search term filter (name, set+number)
                const setNumSpace = `${cardSet} ${cardNumber}`;
                const setNumCombined = `${cardSet}${cardNumber}`;
                const matchesSearch = searchTerm === '' ||
                    cardName.includes(searchTerm) ||
                    cardNameDe.includes(searchTerm) ||
                    setNumSpace.includes(searchTerm) ||
                    setNumCombined.includes(searchTerm);

                const matchesType = currentMetaOverviewCardTypeFilter === 'all' || cardType === currentMetaOverviewCardTypeFilter
                    || (currentMetaOverviewCardTypeFilter === 'Energy' && cardType === 'Basic Energy');
                
                // Show card only if it matches both filters
                if (matchesSearch && matchesType) {
                    card.style.display = '';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update card count
            const countElement = document.getElementById('currentMetaCardCount');
            if (countElement) {
                countElement.textContent = `${visibleCount} Cards`;
            }
        }
        
        function toggleCurrentMetaDeckGridView() {
            const gridViewContainer = document.getElementById('currentMetaDeckVisual');
            const tableViewContainer = document.getElementById('currentMetaDeckTableView');
            // Get button from DOM instead of event
            const gridButtons = document.querySelectorAll('button[onclick*="toggleCurrentMetaDeckGridView"]');
            const button = gridButtons[0];
            
            if (!gridViewContainer || !tableViewContainer) {
                console.warn('Grid or table container not found');
                return;
            }
            
            const cards = window.currentCurrentMetaDeckCards;
            if (!cards || cards.length === 0) {
                showToast('Please select a deck first!', 'warning');
                return;
            }
            
            const isGridViewActive = !gridViewContainer.classList.contains('d-none');
            
            if (isGridViewActive) {
                gridViewContainer.classList.add('d-none');
                if (button) button.textContent = 'Grid View';
            } else {
                tableViewContainer.classList.add('d-none');
                if (button) button.textContent = 'List View';
            }
            
            // Re-apply filter to preserve percentage filter and render correct view
            applyCurrentMetaFilter();
            
            filterCurrentMetaOverviewCards();
        }
        
        function copyCurrentMetaDeckOverview() {
            const deck = window.currentMetaDeck;
            const hasDeck = deck && Object.keys(deck).length > 0;
            
            const allCards = window.currentCurrentMetaDeckCards || [];
            const allCardsFromDb = window.allCardsDatabase || [];
            
            if (!hasDeck && allCards.length === 0) {
                showToast('No cards to copy! Please select an archetype first.', 'warning');
                return;
            }
            
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
            
            if (hasDeck) {
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (count <= 0) continue;
                    
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    const baseName = baseNameMatch ? baseNameMatch[1] : deckKey;
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    const originalSet = setMatch ? setMatch[1] : null;
                    const originalNumber = setMatch ? setMatch[2] : null;
                    
                    let cardData = cardDataByName[baseName];
                    if (!cardData) continue;
                    
                    cardData = { ...cardData };
                    
                    const pref = getRarityPreference(baseName);
                    
                    if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                        const specificCard = allCardsFromDb.find(c => 
                            c.name === baseName && c.set === pref.set && c.number === pref.number
                        );
                        if (specificCard) {
                            cardData.set_code = specificCard.set;
                            cardData.set_number = specificCard.number;
                        }
                    }
                    else if (currentMetaGlobalRarityPreference === 'max' || currentMetaGlobalRarityPreference === 'min') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    else if (originalSet && originalNumber) {
                        cardData.set_code = originalSet;
                        cardData.set_number = originalNumber;
                    }
                    
                    deckCards.push({ ...cardData, count: count });
                }
            } else {
                allCards.forEach(card => {
                    const cardName = card.card_name;
                    const maxCount = parseInt(card.max_count) || 0;
                    if (maxCount <= 0) return;
                    
                    const originalSet = card.set_code || '';
                    const originalNumber = card.set_number || '';
                    let cardData = { ...card };
                    
                    if (currentMetaRarityMode === 'min' || currentMetaRarityMode === 'max') {
                        if (originalSet && originalNumber) {
                            const preferredVersion = getPreferredVersionForCard(cardName, originalSet, originalNumber);
                            if (preferredVersion) {
                                cardData.set_code = preferredVersion.set;
                                cardData.set_number = preferredVersion.number;
                            }
                        }
                    }
                    
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
            
            const sortedCards = sortCardsByType(deckCards);
            
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
                    trainer.push(line);
                    trainerCount += count;
                }
            });
            
            let output = '';
            if (pokemon.length > 0) output += `Pokémon: ${pokemonCount}\n` + pokemon.join('\n') + '\n\n';
            if (trainer.length > 0) output += `Trainer: ${trainerCount}\n` + trainer.join('\n') + '\n\n';
            if (energy.length > 0) output += `Energy: ${energyCount}\n` + energy.join('\n');
            
            navigator.clipboard.writeText(output).then(() => {
                showToast('Deck copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Error copying:', err);
                showToast('Error copying to clipboard!', 'error');
            });
        }
        
        // Add filter change listener
        document.addEventListener('DOMContentLoaded', function() {
            const filterSelect = document.getElementById('currentMetaFilterSelect');
            if (filterSelect) {
                filterSelect.onchange = applyCurrentMetaFilter;
            }
        });