// app-tier-meta.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

        // ============================================================================

        /**
         * Formula: (share * 2) + ((winRate - 50) * 3), normalized to 0-100
         * If winRate doesn't exist, use only share
         */
        function calculatePowerScore(share, winRate = null) {
            let score = 0;

            if (winRate !== null && !isNaN(winRate)) {
                // Full formula with winrate
                score = (share * 2) + ((winRate - 50) * 3);
            } else {
                score = share * 5; // Boost share influence when no winrate
            }

            // Normalize to 0-100 scale
            score = Math.max(0, Math.min(100, score));
            return Math.round(score);
        }

        /**
         * Composite tier score for the Current Meta tier list.
         *
         * Pre-fix the tier list sorted by online-play share alone — that
         * landed Mega Greninja (6 % share, 44 % WR) in Tier 1 just
         * because it was popular. This score blends three signals:
         *
         *   1. Online play share (capped at 15 %)            — popularity
         *   2. Online winrate, Bayesian-shrunk to handle      — quality, with
         *      small samples (prior: 30 games at 50 % WR)      small-N protection
         *   3. Labs tournament performance, when the meta's   — strongest signal
         *      labs CSV is loaded: aggregate WR + Day-2 conv    when available
         *
         * Bayesian shrinkage uses a 50-game prior at 50 % so a
         * 5-game-100 %-WR fluke collapses to ~54.5 %, not 100 % — which
         * is the other half of the user's complaint ("ein Deck was nur
         * 5x zu nem Turnier geht und alle gewinnt … ist ja kein Tier 1").
         * The min-count gate downstream still excludes tiny samples
         * from Tier 1/2/3 outright; the shrinkage only protects against
         * a small-sample WR-overflow contaminating the score ranking.
         *
         * Labs branch is opt-in: pass `labsByName = null` (or a deck
         * not in the dict / with games < 15) and the score collapses
         * to share + adjusted-WR. Same caller path for both modes.
         *
         * @param {{share:number, winrate:number, new_count:number, archetype:string}} deck
         * @param {Object<string,{games:number,winPct:number,day2Conv:number,players:number}>|null} labsByName
         * @returns {{score:number, adjWR:number, labsHit:boolean,
         *            shareComp:number, wrComp:number, labsComp:number}}
         */
        function computeTierScore(deck, labsByName) {
            const share = Math.max(0, Number(deck.share) || 0);
            const rawWR = Math.max(0, Number(deck.winrate) || 0);
            const games = Math.max(0, Number(deck.new_count) || 0);

            const PRIOR_GAMES = 50;
            const wins = games * (rawWR / 100);
            const adjWR = games > 0
                ? (wins + PRIOR_GAMES * 0.5) / (games + PRIOR_GAMES) * 100
                : 50;

            const shareComp = Math.min(share, 15) * 0.6;                  // 0..9
            const wrComp = Math.max(0, Math.min(adjWR - 50, 10)) * 0.8;   // 0..8

            let labsComp = 0;
            let labsHit = false;
            if (labsByName && deck.archetype) {
                const ent = labsByName[deck.archetype]
                         || labsByName[String(deck.archetype).trim()];
                if (ent && ent.games >= 15) {
                    labsHit = true;
                    // Labs WR over 50, capped at +12 pp, weight 1.5
                    // (tournament data is a stronger trust signal).
                    const labsWRComp = Math.max(0, Math.min((ent.winPct || 0) - 50, 12)) * 1.5;
                    // Day-2 conversion: "actually converts entries
                    // into a deep run". 0..0.4 covers the realistic
                    // range across TEF-CRI / TEF-POR data.
                    const day2Comp = Math.max(0, Math.min(ent.day2Conv || 0, 0.4)) * 8;
                    labsComp = labsWRComp + day2Comp;
                }
            }

            return {
                score: shareComp + wrComp + labsComp,
                adjWR, labsHit, shareComp, wrComp, labsComp,
            };
        }

        /**
         * Aggregate raw labs_tournament_decks_<META>.csv rows into a
         * per-deck-name dict for computeTierScore(). Mirrors the
         * weighting in _loadPastMetaLabsAggregate (ties = ½ win, day-2
         * conv = day2/day1) so the Current-Meta tier list and the past-
         * meta cumulative ranking speak the same language.
         *
         * @param {Array<Object>} rows
         * @returns {Object<string, {games:number,winPct:number,day2Conv:number,players:number,tournaments:number}>}
         */

        // Renders the "Top-8 vs. Erwartung" block. Deliberately NOT called
        // "Conversion Performance": that is jargon on a German-language
        // site, and the number answers a plain question — does this deck
        // make the cut more often than the field does.
        //
        // The raw (unsmoothed) value is not shown. Two percentages in one
        // narrow cell compete; the honest confidence signal is the sample
        // size, so that is what sits under the value.
        //
        // Colours come from the existing palette (accent blue #2563eb,
        // decline red #dc2626, neutral #6b7280). Green is avoided on
        // purpose: in the movers block right below it already means
        // "share went up", and a second meaning would collide. The sign is
        // always written out so colour never carries the message alone.
        const CONV_CAP = 100;       // bars beyond this are clipped and marked

        // Eine Nachkommastelle, deutsches Komma, ein Leerzeichen vor dem
        // Zeichen — über window.formatPercent, damit dieselbe Zahl auf
        // keiner zweiten Fläche anders aussieht.
        // Fachbegriffe erklären sich dort, wo die Zahl steht.
        // Heisst absichtlich hintTerm und nicht hint: der alte
        // Conversion-Block fuehrte eine lokale Variable `hint` (den
        // Hinweistext unter seiner Tabelle) und ueberdeckte damit den
        // Helfer — das hat den ganzen Block in den try/catch laufen lassen
        // und drei Tabellen verschwinden lassen. Der Block ist seit dem
        // 19.08.2026 weg, der Name bleibt als Warnung.
        const hintTerm = (label, text) => (typeof window.termHint === 'function')
            ? window.termHint(label, text) : label;
        const TERMS = {
            de: {
                // Der Text beschrieb bis zum 20.08.2026 den Nenner der
                // Turnier-Zaehlung (8.574 gewichtete Antritte) — der gilt aber
                // nur fuer 7 von 138 Zeilen. Die uebrigen 131 stehen auf den
                // gemeldeten Listen der Ladder. Jetzt nennt der Text beide
                // Nenner, und die sieben Ausnahmen sind in der Spalte markiert.
                share: 'Anteil an den gemeldeten Listen der Online-Ladder. Decks ohne Ladder-Zeile zeigen stattdessen ihren Anteil an den gewichteten Turnier-Antritten — diese Werte stehen kursiv.',
                top8: 'Wie oft dieses Deck aus seinen Antritten die Top 8 erreicht hat.',
                vsField: '1,6-mal heißt: erreicht die Top 8 anderthalbmal so oft wie ein durchschnittliches Deck. Kleine Stichproben werden zum Durchschnitt hin geglättet (k = 50) — der rohe Wert steht im Tooltip der Zelle.',
                prev: 'Anteil im vorherigen Vergleichszeitraum.',
                delta: 'Veränderung des Anteils in Prozentpunkten. Gelistet ab 0,4 pp.',
            },
            en: {
                share: 'Share of reported lists on the online ladder. Decks without a ladder row show their share of weighted tournament entries instead — those values are italic.',
                top8: 'How often this deck reached top 8 out of its entries.',
                vsField: '1.6× means: reaches top 8 one and a half times as often as an average deck. Small samples are smoothed toward the average (k = 50) — the raw value is in the cell tooltip.',
                prev: 'Share in the previous comparison window.',
                delta: 'Change in share, in percentage points. Listed from 0.4 pp.',
            },
        };
        const term = (key) => TERMS[getLang() === 'de' ? 'de' : 'en'][key];
        const fmtNumDS = (n) => Math.round(Number(n) || 0)
            .toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US');
        // Halbe Antritte sind echt, nicht Rauschen: online_tournament_top8_decks.csv
        // gewichtet Turniere nach Alter, ein Antritt aus der zweiten Woche zaehlt
        // 0,5. fmtNumDS rundete beides — Antritte UND Cuts — auf ganze Zahlen,
        // waehrend die Quote daneben ungerundet aus den echten Gewichten kam.
        // Terapagos Noctowl las sich dadurch als "2 / 1 / 33,3 %": aus den
        // gezeigten Zahlen waeren 50 %, echt sind es 0,5 von 1,5. 29 von 120
        // Decks widersprachen sich so, das Maximum lag bei 16,7 Prozentpunkten.
        // Mit einer Nachkommastelle, wo der Wert keine ganze Zahl ist, geht die
        // Zeile wieder auf, und die Halbgewichtung wird nebenbei sichtbar.
        const fmtHalb = (n) => {
            const v = Number(n) || 0;
            if (Number.isInteger(v)) return fmtNumDS(v);
            return v.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US',
                { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        };
        const fmtPct = (v, digits) => (typeof window.formatPercent === 'function')
            ? window.formatPercent(v, digits)
            : Number(v).toFixed(digits == null ? 1 : digits) + '%';


        function aggregateLabsRowsByDeck(rows) {
            const byName = new Map();
            for (const r of (rows || [])) {
                const name = String(r.deck_name || '').trim();
                if (!name) continue;
                const wins = parseFloat(r.wins || 0) || 0;
                const losses = parseFloat(r.losses || 0) || 0;
                const ties = parseFloat(r.ties || 0) || 0;
                const players = parseInt(r.player_count || 0, 10) || 0;
                const day1 = parseInt(r.day1_players || 0, 10) || 0;
                const day2 = parseInt(r.day2_players || 0, 10) || 0;
                const tid = String(r.tournament_id || '').trim();
                if (!byName.has(name)) {
                    byName.set(name, { wins:0, losses:0, ties:0, players:0,
                                       day1:0, day2:0, tournaments: new Set() });
                }
                const e = byName.get(name);
                e.wins += wins; e.losses += losses; e.ties += ties;
                e.players += players; e.day1 += day1; e.day2 += day2;
                if (tid) e.tournaments.add(tid);
            }
            const out = {};
            for (const [name, e] of byName) {
                const games = e.wins + e.losses + e.ties;

                // ZWEI Groessen, weil es zwei Fragen sind — und weil diese
                // Funktion vorher eine dritte Konvention erfunden hat.
                //
                // Bis zum 17.08.2026 stand hier (W + 0,5T)/G. Die Quelldatei
                // data/labs_tournament_decks.csv rechnet ihre eigene Spalte
                // win_pct aber als (3W + T)/3N — die Pokemon-Swiss-Punkte, also
                // das, was ueber die Platzierung entscheidet. Nachgerechnet
                // ueber alle 4.667 Zeilen: die Datei-Konvention passt exakt
                // (max. Abweichung 0,005), die hier verwendete lag im Median
                // 2,38 pp und maximal 12,5 pp daneben. Die App hat aus
                // korrekten Rohdaten eine vierte Zahl gemacht.
                //
                //   matchPointPct  Konvention der Quelle, vergleichbar mit
                //                  labs_tournament_decks.csv
                //   winPct         W/(W+L+T), Konvention der Ladder-Datei
                //                  limitless_online_decks.csv
                //
                // Beide werden mitgegeben, damit ein Vergleich nie stillschweigend
                // zwischen zwei Skalen laeuft (siehe die Tier-1-Schwelle unten).
                const matchPointPct = games > 0 ? (3 * e.wins + e.ties) / (3 * games) * 100 : 0;
                const winPct = games > 0 ? e.wins / games * 100 : 0;
                const day2Conv = e.day1 > 0 ? e.day2 / e.day1 : 0;
                out[name] = { games, winPct, matchPointPct, day2Conv,
                              players: e.players, tournaments: e.tournaments.size };
            }
            return out;
        }

        /**
         * Determine tier for a deck
         * @param {Object} deck - Deck object with share, winrate, etc.
         * @returns {string} - 'tier-1', 'tier-2', 'tier-3', or 'tier-trending'
         */
        function getDeckTier(deck) {
            const shareRaw = deck.share || deck.new_share || deck.new_meta_share || deck.percentage_in_archetype || 0;
            const share = parseLocaleNumber(shareRaw, 0);
            const winRate = parseLocaleNumber(deck.winrate || deck.new_winrate, NaN);
            const countChange = parseInt(deck.count_change || 0);

            // Tier 1: Share >= 8%
            if (share >= 8) return 'tier-1';
            
            // Tier 2: Share >= 4% and < 8%
            if (share >= 4 && share < 8) return 'tier-2';

            // Tier 3: Share >= 1.5% and < 4%
            if (share >= 1.5 && share < 4) return 'tier-3';
            
            // Trending / Rogue: below Tier 3
            if (share < 1.5) {
                if (winRate && winRate > 52) return 'tier-trending';
                if (countChange > 0) return 'tier-trending';
                return 'tier-rogue';
            }
            
            return null; // Don't show in tier list
        }
        
        /**
         * Get trend badge HTML based on share changes
         * @param {string} deckName - Name of the deck/archetype
         * @param {number} shareChange - Change in meta share (new - old)
         * @returns {string} - HTML for trend badge or empty string
         */
        function getDeckTrendBadge(deckName, shareChange) {
            if (!shareChange || Math.abs(shareChange) < 0.1) return '';
            
            // Dezimalkomma wie ueberall sonst auf dieser Karte.
            const betrag = fmtPct(Math.abs(shareChange));
            if (shareChange > 0) {
                return `<span class="stat-badge stat-trend-up">+${betrag}</span>`;
            } else {
                return `<span class="stat-badge stat-trend-down">−${betrag}</span>`;
            }
        }

        /**
         * Trend indicator based on last two history points.
         * Expects objects like: { share: number|string }
         * @param {Array} history
         * @returns {string}
         */
        function getTrendIndicator(history) {
            if (!Array.isArray(history) || history.length < 2) return '';

            const parseShare = (value) => {
                const parsed = parseLocaleNumber(value ?? 0, 0);
                return Number.isFinite(parsed) ? parsed : NaN;
            };

            // Compare strictly the last two available time points.
            const validPoints = history.filter(point => Number.isFinite(parseShare(point?.share)));
            if (validPoints.length < 2) return '';

            const recentPoints = validPoints.slice(-2);
            const previous = parseShare(recentPoints[0]?.share);
            const current = parseShare(recentPoints[1]?.share);
            if (!Number.isFinite(previous) || !Number.isFinite(current)) return '';

            const diff = current - previous;

            // STAPLE SCHUTZ: Keine roten Pfeile bei Staples (>95%),
            // es sei denn der Absturz ist massiv (>10%).
            if (current > 95 && diff > -10) return '';

            if (diff > 2) return `<span class="trend-up">▲ +${diff.toFixed(1)}%</span>`;
            if (diff < -2) return `<span class="trend-down">▼ ${diff.toFixed(1)}%</span>`;

            // Verstecke das Badge komplett, wenn stabil.
            return '';
        }

        function getCityLeagueCardShareHistory(cardName, targetArchetype = null) {
            const rows = window.cityLeagueAnalysisData || [];
            if (!cardName || rows.length === 0) return [];

            const normalizeName = (name) => {
                const raw = String(name || '');
                if (typeof fixCardNameEncoding === 'function') {
                    return fixCardNameEncoding(raw).trim().toLowerCase();
                }
                return raw.trim().toLowerCase();
            };

            const targetName = normalizeName(cardName);
            const targetArchNormalized = targetArchetype && targetArchetype !== 'all' ? targetArchetype.trim().toLowerCase() : null;
            const parseNum = (value) => parseLocaleNumber(value ?? 0, 0);

            const getIsoWeekFromDate = (isoDate) => {
                const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!match) return '';

                const year = parseInt(match[1], 10);
                const month = parseInt(match[2], 10);
                const day = parseInt(match[3], 10);
                const dt = new Date(Date.UTC(year, month - 1, day));
                if (Number.isNaN(dt.getTime())) return '';

                const isoDay = dt.getUTCDay() || 7;
                dt.setUTCDate(dt.getUTCDate() + 4 - isoDay);
                const isoYear = dt.getUTCFullYear();
                const yearStart = new Date(Date.UTC(isoYear, 0, 1));
                const weekNo = Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
                return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
            };

            const getWeekPeriod = (row) => {
                const rawPeriod = String(row.period || '').trim();
                const periodMatch = rawPeriod.match(/^(\d{4})-W(\d{1,2})$/i);
                if (periodMatch) {
                    return `${periodMatch[1]}-W${String(periodMatch[2]).padStart(2, '0')}`;
                }

                const rawDate = String(row.tournament_date || row.date || '').trim();
                const normalizedDate = parseJapaneseDate(rawDate) || rawDate;
                return getIsoWeekFromDate(normalizedDate);
            };

            const getTournamentBucket = (row, weekPeriod) => {
                const tId = String(row.tournament_id || '').trim();
                if (tId && weekPeriod) return `${tId}|||${weekPeriod}`;
                if (tId) return `id:${tId}`;
                if (weekPeriod) return `week:${weekPeriod}`;
                return 'global';
            };

            const tournamentArchetypeDecks = new Map();
            rows.forEach(row => {
                const period = getWeekPeriod(row);
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decks = parseNum(row.total_decks_in_archetype_in_period || row.total_decks_in_archetype || 0);
                const tournamentBucket = getTournamentBucket(row, period);
                const key = `${tournamentBucket}|||${archetype}`;
                const prev = tournamentArchetypeDecks.get(key) || 0;
                if (decks > prev) tournamentArchetypeDecks.set(key, decks);
            });

            const totalDecksByPeriod = new Map();
            tournamentArchetypeDecks.forEach((decks, key) => {
                const keyParts = key.split('|||');
                const period = keyParts.length >= 2 ? keyParts[1] : '';
                if (!period) return;
                totalDecksByPeriod.set(period, (totalDecksByPeriod.get(period) || 0) + decks);
            });

            const decksWithCardByPeriod = new Map();
            rows.forEach(row => {
                const rowName = normalizeName(row.card_name || row.full_card_name || '');
                if (!rowName || rowName !== targetName) return;

                const period = getWeekPeriod(row);
                const archetype = String(row.archetype || '').trim().toLowerCase();
                if (!period || !archetype) return;

                if (targetArchNormalized && archetype !== targetArchNormalized) return;

                const decksWithCard = parseNum(row.deck_inclusion_count || row.deck_count || 0);
                decksWithCardByPeriod.set(period, (decksWithCardByPeriod.get(period) || 0) + decksWithCard);
            });

            return Array.from(totalDecksByPeriod.keys())
                .sort((a, b) => String(a).localeCompare(String(b)))
                .map(period => {
                    const totalDecks = totalDecksByPeriod.get(period) || 0;
                    const decksWithCard = decksWithCardByPeriod.get(period) || 0;
                    const share = totalDecks > 0 ? (decksWithCard / totalDecks) * 100 : 0;
                    return { period, share };
                })
                .filter(entry => Number.isFinite(entry.share));
        }
        
        /**
         * Fuzzy lookup for cardDataByArchetype.
         * Handles apostrophe/possessive differences (Rocket's → Rocket), "ex" suffixes, partial matches.
         */
        function _normArchName(name) {
            return String(name || '').toLowerCase()
                .replace(/[''`]s\b/g, '')   // strip possessive 's (Rocket's → Rocket)
                .replace(/[''`]/g, '')        // strip remaining apostrophes
                .replace(/-/g, ' ')           // hyphens → spaces (Raging-Bolt → Raging Bolt)
                .replace(/\s+/g, ' ').trim();
        }

        // Reused across many tile renders. Cache the per-imageMap
        // normalised-key lookup so we don't rebuild it on every card.
        let _imageMapNormCache = null;
        let _imageMapNormCacheRef = null;
        function _buildImageMapNormCache(imageMap) {
            if (_imageMapNormCacheRef === imageMap && _imageMapNormCache) {
                return _imageMapNormCache;
            }
            const cache = {};
            Object.keys(imageMap || {}).forEach(k => {
                const norm = _normArchName(k);
                if (norm && !cache[norm]) cache[norm] = imageMap[k];
            });
            _imageMapNormCache = cache;
            _imageMapNormCacheRef = imageMap;
            return cache;
        }

        /**
         * Resolve an image URL for an archetype tile, falling back through
         * progressively looser matches when the archetype name in the data
         * differs from the key the image map was generated under. This
         * happens when:
         *   - The crawl normalises punctuation differently (Raging-Bolt
         *     Ogerpon ↔ Raging Bolt Ogerpon).
         *   - A new family prefix appears (Rocket's Mewtwo) before the
         *     image map has been regenerated, so the map only has the
         *     prefix-less form.
         *   - The hero card aggregates several variants but the
         *     representative variant happens to lack an entry.
         *
         * Without this fallback, the affected tiles render as grey boxes
         * even though a perfectly-good image for a sibling variant or the
         * normalised form is available right next door in the map.
         *
         * fallbackVariants is optional and only relevant for hero cards
         * (a family-grouped tile can borrow any of its variants' images).
         */
        function getImageUrlFuzzy(name, imageMap, fallbackVariants) {
            if (!imageMap || !name) return '';
            if (imageMap[name]) return imageMap[name];

            const cache = _buildImageMapNormCache(imageMap);
            const normName = _normArchName(name);
            if (normName && cache[normName]) return cache[normName];

            // Last-word / last-two-words probe: lets "Rocket's Mewtwo"
            // resolve to "Spidops Mewtwo" (Mewtwo is the visual identity).
            const words = normName.split(' ').filter(Boolean);
            if (words.length >= 2) {
                const tail2 = words.slice(-2).join(' ');
                if (cache[tail2]) return cache[tail2];
                const tail1 = words.slice(-1).join(' ');
                if (cache[tail1]) return cache[tail1];

                // Word-overlap scan over the normalised keys. Threshold ≥1
                // means we only return a hit when the archetype shares at
                // least one Pokemon name with an existing key — never a
                // random card from the map.
                let bestKey = null;
                let bestOverlap = 0;
                Object.keys(cache).forEach(k => {
                    const kWords = k.split(' ').filter(Boolean);
                    const overlap = words.filter(w => kWords.includes(w)).length;
                    if (overlap > bestOverlap) {
                        bestOverlap = overlap;
                        bestKey = k;
                    }
                });
                if (bestKey && bestOverlap >= 1) return cache[bestKey];
            }

            if (Array.isArray(fallbackVariants)) {
                for (const v of fallbackVariants) {
                    if (!v || v === name) continue;
                    if (imageMap[v]) return imageMap[v];
                    const nv = _normArchName(v);
                    if (nv && cache[nv]) return cache[nv];
                }
            }

            return '';
        }

        function fuzzyArchetypeLookup(archetypeName, cardDataByArchetype) {
            if (!archetypeName || !cardDataByArchetype) return [];

            // 1) Exact match
            if (cardDataByArchetype[archetypeName]) return cardDataByArchetype[archetypeName];

            const norm = _normArchName(archetypeName);
            const normalizedMap = window._cardArchetypeNormalizedMap || {};

            // 2) Normalized exact match (handles apostrophe/possessive)
            if (normalizedMap[norm]) return cardDataByArchetype[normalizedMap[norm]] || [];

            // 3) Try with/without "ex" suffix
            const normEx = norm.endsWith(' ex') ? norm : norm + ' ex';
            const normNoEx = norm.endsWith(' ex') ? norm.slice(0, -3).trim() : norm;
            if (normalizedMap[normEx]) return cardDataByArchetype[normalizedMap[normEx]] || [];
            if (normalizedMap[normNoEx]) return cardDataByArchetype[normalizedMap[normNoEx]] || [];

            // 4) Partial match: archetype key starts with our query or vice versa
            const allNormKeys = Object.keys(normalizedMap);
            const startMatch = allNormKeys.find(k => k.startsWith(norm) || norm.startsWith(k));
            if (startMatch) return cardDataByArchetype[normalizedMap[startMatch]] || [];

            // 5) Word-overlap matching (for multi-word names like "Rocket's Mewtwo" → "Rocket Mewtwo Ex")
            const normWords = norm.split(' ');
            const ignoreWords = new Set(['ex', 'jtg', 'tef', 'scr', 'twm', 'dri', 'meg', 'box']);
            let bestKey = null;
            let bestOverlap = 0;
            allNormKeys.forEach(k => {
                const kWords = k.split(' ').filter(w => !ignoreWords.has(w));
                const overlap = normWords.filter(w => kWords.includes(w)).length;
                if (overlap > bestOverlap) {
                    bestOverlap = overlap;
                    bestKey = k;
                }
            });
            if (bestKey && bestOverlap >= 1) return cardDataByArchetype[normalizedMap[bestKey]] || [];

            return [];
        }

        /**
         * Find the best representative image for an archetype
         * Priority: 1) Pokemon ex/VSTAR/VMAX, 2) Stage 2, 3) First Pokemon
         * @param {string} archetypeName - Name of the archetype
         * @param {Array} archetypeCardsData - Array of card objects for this deck
         * @returns {string} - Image URL or fallback
         */
        function getArchetypeImage(archetypeName, archetypeCardsData) {
            if (!archetypeCardsData || archetypeCardsData.length === 0) {
                return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280"%3E%3Crect fill="%23ddd" width="200" height="280"/%3E%3C/svg%3E';
            }
            
            // Priority 0: If a non-Pokemon card matches the archetype name, use it
            // (e.g., "Festival Lead" → "Festival Grounds" stadium card)
            const archetypeBase = archetypeName.split(' ').slice(0, 2).join(' ').toLowerCase();
            const archetypeFirstWord = archetypeName.split(' ')[0].toLowerCase();
            const nameMatchAll = archetypeCardsData.filter(card => {
                const cardName = (card.card_name || '').toLowerCase();
                return cardName.includes(archetypeBase) || cardName.startsWith(archetypeFirstWord);
            });
            if (nameMatchAll.length > 0) {
                // Prefer Pokemon cards over Trainers, but still use Trainer if no Pokemon match
                const pokemonMatch = nameMatchAll.filter(c => {
                    const t = (c.type || '').toLowerCase();
                    return !t.includes('trainer') && !t.includes('energy') && !t.includes('item') && !t.includes('supporter') && !t.includes('stadium');
                });
                if (pokemonMatch.length > 0) {
                    pokemonMatch.sort((a, b) => parseFloat(b.percentage_in_archetype || 0) - parseFloat(a.percentage_in_archetype || 0));
                    return pokemonMatch[0].image_url || '';
                }
                // Use Trainer/Stadium match (e.g., Festival Grounds)
                nameMatchAll.sort((a, b) => parseFloat(b.percentage_in_archetype || 0) - parseFloat(a.percentage_in_archetype || 0));
                return nameMatchAll[0].image_url || '';
            }

            // Filter only Pokemon cards
            const pokemonCards = archetypeCardsData.filter(card => {
                const cardType = card.type || '';
                return !cardType.toLowerCase().includes('trainer') && 
                       !cardType.toLowerCase().includes('energy') &&
                       !cardType.toLowerCase().includes('item') &&
                       !cardType.toLowerCase().includes('supporter') &&
                       !cardType.toLowerCase().includes('stadium');
            });
            
            if (pokemonCards.length === 0) return '';
            
            // Priority 2: Pokemon ex, VSTAR, VMAX, V-UNION (sorted by usage)
            const specialPokemon = pokemonCards.filter(card => {
                const name = (card.card_name || '').toLowerCase();
                return name.includes(' ex') || name.includes('vstar') || 
                       name.includes('vmax') || name.includes('v-union');
            });
            
            if (specialPokemon.length > 0) {
                // Sort by percentage_in_archetype AND total_count (main attacker has higher usage)
                specialPokemon.sort((a, b) => {
                    const pctA = parseFloat(a.percentage_in_archetype || 0);
                    const pctB = parseFloat(b.percentage_in_archetype || 0);
                    const countA = parseInt(a.total_count || 0);
                    const countB = parseInt(b.total_count || 0);
                    
                    // Primary sort by percentage, secondary by count
                    if (pctB !== pctA) return pctB - pctA;
                    return countB - countA;
                });
                return specialPokemon[0].image_url || '';
            }
            
            // Priority 3: Stage 2 Pokemon (includes "Stage 2" in type)
            const stage2Pokemon = pokemonCards.filter(card => {
                const type = (card.type || '').toLowerCase();
                return type.includes('stage 2');
            });
            
            if (stage2Pokemon.length > 0) {
                stage2Pokemon.sort((a, b) => {
                    const pctA = parseFloat(a.percentage_in_archetype || 0);
                    const pctB = parseFloat(b.percentage_in_archetype || 0);
                    return pctB - pctA;
                });
                return stage2Pokemon[0].image_url || '';
            }
            
            // Priority 4: Most common Pokemon card
            pokemonCards.sort((a, b) => {
                const pctA = parseFloat(a.percentage_in_archetype || 0);
                const pctB = parseFloat(b.percentage_in_archetype || 0);
                return pctB - pctA;
            });
            
            return pokemonCards[0].image_url || '';
        }

        function getCombinedMainArchetypeLabel(archetypeName) {
            const raw = String(archetypeName || '').trim().toLowerCase();
            if (!raw) return '';

            if (raw.startsWith('mega ')) {
                const parts = raw.split(' ');
                return parts.slice(0, 2).join(' ');
            }
            if (raw.startsWith('alolan ') || raw.startsWith('galarian ') || raw.startsWith('hisuian ')) {
                const parts = raw.split(' ');
                return parts.slice(0, 2).join(' ');
            }
            return raw.split(' ')[0];
        }

        function toTitleCaseWords(value) {
            return String(value || '')
                .split(' ')
                .filter(Boolean)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }
        
        /**
         * Render Tier List for City League
         * Generates banner-style deck cards grouped by tier
         */
        async function renderCityLeagueTierList(prefetchedAnalysisData = null, imageMap = null) {
            const content = document.getElementById('cityLeagueContent');
            if (!content || !cityLeagueData || cityLeagueData.length === 0) return;
            
            // Load card data for images
            const timestamp = new Date().getTime();
            let cardDataByArchetype = {};
            
            // Wenn imageMap vorhanden (vorberechnete Archetype→Image-URL-Map, ~30 KB),
            // koennen wir das Laden/Parsen der 35 MB Analysis-CSV komplett ueberspringen.
            if (!imageMap) {
                try {
                    const cardsData = prefetchedAnalysisData || await (async () => {
                        // 'past' loads city_league_analysis_past.csv (auto-
                        // generated by city_league_past_analysis_scraper).
                        // The old 'M3' identifier + city_league_analysis_M3.csv
                        // file are legacy — the past snapshot moved to the
                        // _past suffix on 2026-05-23.
                        const format = window.currentCityLeagueFormat === 'past' ? 'past' : 'current';
                        // Go through the shared format-keyed loader in
                        // app-city-league.js. This used to be its own fetch of
                        // the same file that loadCityLeagueData already had in
                        // flight — 41.4 MB downloaded twice in Past Meta, since
                        // prefetchedAnalysisData is null at the only call site.
                        if (typeof window.getCityLeagueAnalysisData === 'function') {
                            return await window.getCityLeagueAnalysisData(format);
                        }
                        const formatSuffix = format === 'past' ? '_past' : '';
                        const cardsResponse = await fetch(`${BASE_PATH}city_league_analysis${formatSuffix}.csv?t=${timestamp}`);
                        if (!cardsResponse.ok) return [];
                        const cardsText = await cardsResponse.text();
                        return parseCSV(cardsText);
                    })();

                    // Group cards by archetype
                    cardsData.forEach(card => {
                        const arch = card.archetype;
                        if (!cardDataByArchetype[arch]) cardDataByArchetype[arch] = [];
                        cardDataByArchetype[arch].push(card);
                    });

                    // Build normalized lookup for fuzzy matching (same as current meta)
                    window._cardArchetypeNormalizedMap = {};
                    Object.keys(cardDataByArchetype).forEach(key => {
                        window._cardArchetypeNormalizedMap[_normArchName(key)] = key;
                    });
                } catch (e) {
                    console.warn('Could not load card data for images:', e);
                }
            }
            
            const parseDeckCount = (deck) => {
                const countRaw = deck.count || deck.new_count || deck.deck_count || 0;
                const parsed = parseInt(String(countRaw).replace(',', '.'), 10);
                return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
            };

            const parseDeckRank = (deck) => {
                const isCurrentFormat = window.currentCityLeagueFormat === 'current';
                const rankRaw = isCurrentFormat
                    ? (deck.new_avg_placement || deck.avg_placement || deck.average_placement || '999')
                    : (deck.average_placement || deck.avg_placement || deck.new_avg_placement || '999');
                const parsed = parseLocaleNumber(rankRaw, 0);
                return Number.isFinite(parsed) && parsed > 0 ? parsed : 999;
            };

            // 1. Sort descending by count (= Meta-Share / deck-list count).
            const archetypeArray = [...cityLeagueData].sort((a, b) => parseDeckCount(b) - parseDeckCount(a));

            // Hero section: combine variants by main Pokemon using same grouping rules as Archetype Combined.
            const combinedHeroMap = new Map();
            archetypeArray.forEach(deck => {
                const archetypeName = String(deck.archetype || '').trim();
                if (!archetypeName) return;

                const mainKey = getCombinedMainArchetypeLabel(archetypeName);
                if (!mainKey) return;

                const deckCount = parseDeckCount(deck);
                const avgRank = parseDeckRank(deck);

                if (!combinedHeroMap.has(mainKey)) {
                    combinedHeroMap.set(mainKey, {
                        key: mainKey,
                        label: toTitleCaseWords(mainKey),
                        totalCount: 0,
                        weightedRankSum: 0,
                        variants: [],
                        representativeVariant: archetypeName,
                        representativeDeckCount: 0
                    });
                }

                const group = combinedHeroMap.get(mainKey);
                group.totalCount += deckCount;
                group.weightedRankSum += avgRank * Math.max(1, deckCount);
                group.variants.push(archetypeName);

                if (deckCount > group.representativeDeckCount) {
                    group.representativeVariant = archetypeName;
                    group.representativeDeckCount = deckCount;
                }
            });

            const topHeroArchetypes = Array.from(combinedHeroMap.values())
                .sort((a, b) => b.totalCount - a.totalCount)
                .slice(0, 5)
                .map(item => ({
                    ...item,
                    weightedRank: item.totalCount > 0 ? (item.weightedRankSum / item.totalCount) : 999
                }));

            // ── Tier 1 heisst hier "Listenplatz 1 bis 3", nicht "gut" (20.08.2026) ──
            //
            // Diese Einteilung ist ein reiner Indexschnitt auf einer nach
            // Listenzahl absteigend sortierten Liste. Sie sagt nichts ueber
            // Spielstaerke, und sie kennt keine Mindeststichprobe: aus einem
            // einzigen Sonderturnier mit 26 Decks entstand eine vollstaendige
            // Tier-Liste, in der Tier 2 vier Archetypen mit je EINEM Deck
            // enthielt.
            //
            // Die Untertitel sagten dazu "Beherrschen das Meta" / "Starke
            // Herausforderer" / "Spielbare Optionen" — drei Qualitaetsaussagen
            // ueber eine Rangfolge nach Beliebtheit. Am letzten vollstaendigen
            // Datenstand (city_league_archetypes_comparison_M3.csv, 304
            // Archetypen) traegt das nicht:
            //
            //     Tier 1 (Raenge 1-3):  Oe-Platzierung 8,07 - 8,73
            //     Tier 2 (Raenge 4-10): Oe-Platzierung 7,74 - 8,60
            //
            // Das beste Tier-2-Deck steht besser da als JEDES Tier-1-Deck. Die
            // gesamte Spreizung ueber die 20 gelisteten Decks betraegt 1,72
            // Plaetze, und das 95-%-Intervall des groessten Decks allein liegt
            // bei +-0,37. Es wird also eine Rangfolge gezeigt, deren Abstaende
            // groesstenteils in ihrer eigenen Unsicherheit verschwinden.
            //
            // Die Einteilung selbst bleibt — sie ist eine brauchbare
            // Gliederung nach Verbreitung. Nur ihr Name sagt jetzt, was sie
            // misst, und die Grundlage steht darueber.
            const tierGroups = { 'tier-1': [], 'tier-2': [], 'tier-3': [], 'tier-trending': [] };
            archetypeArray.forEach((deck, idx) => {
                if (idx <= 2)       tierGroups['tier-1'].push(deck);
                else if (idx <= 9)  tierGroups['tier-2'].push(deck);
                else if (idx <= 19) tierGroups['tier-3'].push(deck);
                else                tierGroups['tier-trending'].push(deck);
            });

            const tierTitles = {
                'tier-1':        { title: 'Tier 1',           subtitle: t('tier.clSub1')     },
                'tier-2':        { title: 'Tier 2',           subtitle: t('tier.clSub2')     },
                'tier-3':        { title: 'Tier 3',           subtitle: t('tier.clSub3')     },
                'tier-trending': { title: 'Rogue / Trending',  subtitle: t('tier.clSubRogue') }
            };

            // Die Gesamtstichprobe, aus der das hier entsteht. Ohne sie sieht
            // eine Tier-Liste aus 26 Decks genauso aus wie eine aus 8.000.
            const clGesamtListen = archetypeArray.reduce((s, d) => s + parseDeckCount(d), 0);
            const clArchetypen   = archetypeArray.length;
            const clEinzelstueck = archetypeArray.filter(d => parseDeckCount(d) === 1).length;
            // Fuer den Pfeil-Schwellwert weiter unten: unter wie vielen Listen
            // ist eine Oe-Platzierung nicht mehr als eine Anekdote?
            const CL_MIN_LISTEN_PFEIL = 20;
            // Und wie gross muss der Unterschied mindestens sein? Gemessen am
            // letzten vollstaendigen Datenstand liegt das 95-%-Intervall des
            // groessten Archetyps bei +-0,37 Plaetzen; bei 100 Listen sind es
            // +-0,90. Ein halber Platz ist die untere Grenze dessen, was man
            // ueberhaupt behaupten kann — darunter gibt es keinen Pfeil.
            const CL_MIN_DIFF_PFEIL = 0.5;

            // 3. Within each tier sort by avg_placement ascending (lower = better).
            //
            // Ausser im Rogue-Block. Dort stehen die Archetypen mit den
            // duennsten Stichproben, und eine Sortierung nach Oe-Platzierung
            // stellt genau die nach oben, die aus einer einzigen Liste
            // bestehen: am gemessenen Datenstand fuehrten drei Decks mit je
            // EINER Liste und Platzierung 1,00 den Block an, und 170 von 284
            // Rogue-Decks zeigten eine bessere Platzierung als das
            // schlechteste Tier-3-Deck (Dusknoir Mega Diancie, 9,46 aus 98
            // Listen). Nicht weil sie besser waeren, sondern weil ein
            // Einzelergebnis keinen Mittelwert hat, gegen den es zurueckfaellt.
            // Der Rogue-Block sortiert deshalb nach Listenzahl.
            Object.keys(tierGroups).forEach((tierKey) => {
                if (tierKey === 'tier-trending') {
                    tierGroups[tierKey].sort((a, b) => parseDeckCount(b) - parseDeckCount(a));
                } else {
                    tierGroups[tierKey].sort((a, b) => parseDeckRank(a) - parseDeckRank(b));
                }
            });

            let heroHtml = '';
            if (topHeroArchetypes.length > 0) {
                heroHtml = `
                    <section class="tier-hero-section" aria-label="${escapeHtml(t('cl.heroAria'))}">
                        <div class="tier-hero-header">
                            <h2>${t('cl.heroTitle')}</h2>
                            <p>${t('cl.heroSubtitle')}</p>
                        </div>
                        <div class="tier-hero-grid">`;

                topHeroArchetypes.forEach((item, index) => {
                    const representativeCards = cardDataByArchetype[item.representativeVariant] || [];
                    const imageUrl = imageMap
                        ? getImageUrlFuzzy(item.representativeVariant, imageMap, item.variants)
                        : getArchetypeImage(item.representativeVariant, representativeCards);
                    const combinedMainEscaped = escapeJsStr(item.key || item.label || item.representativeVariant || '');
                    const combinedVariantsJsonEscaped = escapeJsStr(encodeURIComponent(JSON.stringify(item.variants || [])));
                    const avgRankText = Number.isFinite(item.weightedRank) && item.weightedRank < 999
                        ? item.weightedRank.toFixed(1)
                        : '0.0';
                    const variantCount = item.variants.length;
                    const variantLabel = variantCount === 1 ? t('cl.heroVariantSingular') : t('cl.heroVariantPlural');

                    heroHtml += `
                        <div class="tier-hero-card" onclick="analyzeCombinedArchetype('${combinedMainEscaped}', '${combinedVariantsJsonEscaped}')">
                            ${imageUrl ? `<div class="tier-hero-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="tier-hero-content">
                                <div class="archetype-card-header">
                                    <span class="archetype-rank-badge">#${index + 1}</span>
                                    <h3 class="archetype-card-title">${item.label}</h3>
                                </div>
                                <div class="tier-hero-meta">${variantCount} ${variantLabel}</div>
                                <div class="tier-hero-stats">
                                    <span class="stat-badge">${item.totalCount} ${t('cl.decks')}</span>
                                    <span class="stat-badge rank-performance-hint" title="${escapeHtml(t('cl.heroRankHint'))}">${t('cl.heroAvgRank')} ${avgRankText}</span>
                                </div>
                            </div>
                        </div>`;
                });

                heroHtml += `
                        </div>
                    </section>`;
            }

            // Woraus das hier entsteht — eine Zeile, die es vorher nicht gab.
            const clGrundlage = `
                <p class="tier-grundlage">${escapeHtml(
                    t('tier.clBasis')
                        .replace('{listen}', clGesamtListen.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US'))
                        .replace('{archetypen}', String(clArchetypen))
                        .replace('{einzel}', String(clEinzelstueck)))}</p>`;

            let html = heroHtml + clGrundlage + '<div style="margin-bottom: 30px;">';
            
            // Render each tier
            ['tier-1', 'tier-2', 'tier-3', 'tier-trending'].forEach(tierKey => {
                const decks = tierGroups[tierKey];
                if (decks.length === 0) return;
                const tierMeta = tierTitles[tierKey];
                const isTrending = tierKey === 'tier-trending';

                if (isTrending) {
                    html += `
                    <div class="tier-section ${tierKey}" id="${tierKey}">
                        <details>
                            <summary class="tier-trending-summary">
                                <h3 style="display:inline;">${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                                <span class="tier-trending-count">${decks.length} ${t('cl.decks')}</span>
                            </summary>
                            <div class="deck-grid tier-deck-grid">`;
                } else {
                    html += `
                    <div class="tier-section ${tierKey}" id="${tierKey}">
                        <h3>${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                        <div class="deck-grid tier-deck-grid">`;
                }

                decks.forEach(deck => {
                    const archetypeName = deck.archetype;
                    const deckName = archetypeName;
                    const isCurrentFormat = window.currentCityLeagueFormat === 'current';

                    // parseLocaleNumber, nicht parseFloat.
                    //
                    // Diese Felder kommen aus data/city_league_archetypes_comparison.csv
                    // und tragen ein deutsches Dezimalkomma — js/app-city-league.js:303
                    // schreibt sie ausdruecklich mit .replace('.', ','). parseFloat('23,08')
                    // ergibt 23: die Nachkommastellen fielen ab. Gemessen am 20.08.2026 am
                    // letzten vollstaendigen Datenstand: 143 falsche Oe-Platzierungen und
                    // 114 falsche Anteile, dazu 146 Aufwaertspfeile ohne echte Veraenderung.
                    //
                    // Heute unsichtbar, weil die City-League-Dateien seit der Rotation am
                    // 31.07.2026 leer sind — es schlaegt in der Sekunde durch, in der
                    // wieder Daten kommen. js/app-city-league.js:169 liest dieselben
                    // Felder seit jeher richtig; hier fehlte es.
                    const zahlAus = (typeof window.parseLocaleNumber === 'function')
                        ? window.parseLocaleNumber : parseFloat;
                    const currentRankValue = zahlAus(
                        isCurrentFormat
                            ? (deck.new_avg_placement || deck.avg_placement || deck.average_placement || 0)
                            : (deck.average_placement || deck.avg_placement || deck.new_avg_placement || 0)
                    , 0);
                    const currentShareValue = zahlAus(
                        isCurrentFormat
                            ? (deck.new_meta_share || deck.new_share || deck.share || deck.percentage_in_archetype || 0)
                            : (deck.share || deck.percentage_in_archetype || deck.new_meta_share || deck.new_share || 0)
                    , 0);
                    
                    // Get archetype image
                    const archetypeCards = fuzzyArchetypeLookup(archetypeName, cardDataByArchetype);
                    const imageUrl = imageMap
                        ? getImageUrlFuzzy(archetypeName, imageMap)
                        : getArchetypeImage(archetypeName, archetypeCards);
                    
                    // Deutsches Dezimalkomma. Die Werte kommen aus einer
                    // Datei mit Komma, werden zum Rechnen auf Punkt gedreht
                    // und standen danach als "8.1" auf einer deutschen Seite —
                    // waehrend die Karte daneben "54,0 %" schreibt.
                    const kommaAus = (x, n) => (getLang() === 'de'
                        ? x.toFixed(n).replace('.', ',') : x.toFixed(n));
                    const currentRank = currentRankValue > 0 ? kommaAus(currentRankValue, 1) : kommaAus(0, 1);
                    const currentShare = kommaAus(currentShareValue, 1);
                    const m3Deck = window.m3BaselineData ? window.m3BaselineData[deckName] : null;

                    // Wie viele Listen stehen hinter dieser Zeile? Ohne diese
                    // Zahl sieht "Rank: 1.0" aus einer einzigen Liste genauso
                    // aus wie "Rank: 8.5" aus 608.
                    const listenN = parseDeckCount(deck);

                    let rankTrendClass = 'trend-neutral';
                    let shareTrendClass = 'trend-neutral';
                    let rankIcon = '';
                    let shareIcon = '';
                    let m3RankDisplay = '';
                    let m3ShareDisplay = '';
                    const isM4WithComparison = window.currentCityLeagueFormat === 'current' && !!m3Deck;

                    if (isM4WithComparison) {
                        // 1. Werte sicher als Zahlen extrahieren
                        const currentR = parseLocaleNumber(currentRankValue || 0, 0);
                        const previousR = m3Deck
                            ? parseLocaleNumber(m3Deck.average_placement || m3Deck.avg_placement || 0, 0)
                            : null;

                        const normalizedCurrentS = parseFloat(currentShareValue || 0);
                        const normalizedPreviousS = m3Deck
                            ? parseLocaleNumber(m3Deck.share || m3Deck.percentage_in_archetype || 0, 0)
                            : null;

                        let rankClass = "trend-neutral";
                        rankIcon = "\u2013";

                        // Ein Pfeil braucht einen Unterschied, den man
                        // behaupten kann (20.08.2026).
                        //
                        // Bis hierher genuegte `currentR !== previousR`: 8,46
                        // gegen 8,47 ergab einen roten Abwaertspfeil. Die
                        // gesamte Spreizung ueber alle gelisteten Archetypen
                        // betraegt 1,72 Plaetze, das 95-%-Intervall des
                        // groessten Decks +-0,37 — bei einem Hundertstel Platz
                        // ist ein Farbpfeil eine Behauptung ueber Rauschen.
                        //
                        // Jetzt braucht er beides: genug Listen auf beiden
                        // Seiten und mindestens einen halben Platz Unterschied.
                        // Sonst bleibt der neutrale Strich stehen, den es
                        // ohnehin schon gibt.
                        const vorherN = m3Deck ? parseDeckCount(m3Deck) : 0;
                        const genugListen = listenN >= CL_MIN_LISTEN_PFEIL
                                         && vorherN >= CL_MIN_LISTEN_PFEIL;
                        if (Number.isFinite(currentR) && Number.isFinite(previousR) && previousR > 0
                            && genugListen && Math.abs(currentR - previousR) >= CL_MIN_DIFF_PFEIL) {
                            // TCG LOGIK: Kleinerer Rang = Besser (Aufstieg)
                            if (currentR < previousR) {
                                // Beispiel: 7.0 (M4) < 8.5 (M3) -> Verbesserung!
                                rankIcon = "▲";
                                rankClass = "trend-positive"; // Grün
                            } else if (currentR > previousR) {
                                // Beispiel: 9.0 (M4) > 8.5 (M3) -> Verschlechterung!
                                rankIcon = "▼";
                                rankClass = "trend-negative"; // Rot
                            }
                        }
                        rankTrendClass = rankClass;

                        // 3. SHARE-TREND (Höher ist besser!)
                        let shareClass = "trend-neutral";
                        shareIcon = "\u2013";
                        // Dieselbe Schwelle fuer den Anteil: 0,1 Prozentpunkte.
                        // Darunter bewegt sich ein Archetyp mit 20 Listen schon
                        // durch eine einzige Liste mehr oder weniger.
                        const CL_MIN_DIFF_ANTEIL = 0.1;
                        if (normalizedPreviousS !== null
                            && Math.abs(normalizedCurrentS - normalizedPreviousS) >= CL_MIN_DIFF_ANTEIL) {
                            if (normalizedCurrentS > normalizedPreviousS) {
                                // Mehr Marktanteil
                                shareIcon = "▲";
                                shareClass = "trend-positive";
                            } else if (normalizedCurrentS < normalizedPreviousS) {
                                // Weniger Marktanteil
                                shareIcon = "▼";
                                shareClass = "trend-negative";
                            }
                        }
                        shareTrendClass = shareClass;

                        const _komma = (x, n) => (getLang() === 'de'
                            ? x.toFixed(n).replace('.', ',') : x.toFixed(n));
                        m3RankDisplay = Number.isFinite(previousR)
                            ? `<span class="stat-compare-value">(M3: ${_komma(previousR, 1)})</span>`
                            : '';
                        m3ShareDisplay = Number.isFinite(normalizedPreviousS)
                            ? `<span class="stat-compare-value">(M3: ${_komma(normalizedPreviousS, 1)}%)</span>`
                            : '';
                    }

                    // Die Zahl, die alles andere traegt, stand nicht auf der
                    // Karte: aus wie vielen Listen kommen Platzierung und
                    // Anteil? Am gemessenen Datenstand haben 128 von 304
                    // Archetypen genau EINE, der Median liegt bei zwei. Eine
                    // Platzierung aus einer Liste ist keine Ø-Platzierung, sie
                    // ist ein Ergebnis. Sie steht jetzt daneben, und unter der
                    // Schwelle traegt sie den Zusatz.
                    const listenText = (getLang() === 'de'
                        ? `${listenN.toLocaleString('de-DE')} ${listenN === 1 ? 'Liste' : 'Listen'}`
                        : `${listenN.toLocaleString('en-US')} ${listenN === 1 ? 'list' : 'lists'}`);
                    const duenn = listenN > 0 && listenN < CL_MIN_LISTEN_PFEIL;
                    const duennTitel = escapeHtml(t('tier.clThinSampleTip')
                        .replace('{n}', String(CL_MIN_LISTEN_PFEIL)));

                    const statsHtml = `
                        <div class="deck-banner-stats" style="display: flex; flex-direction: column; align-items: flex-start;">
                            <span class="stat-badge rank-performance-hint" style="background: #fff3e0; color: #e65100;" title="${escapeHtml(t('cl.heroRankHint'))}">
                                ${escapeHtml(t('tier.clRank'))}: ${currentRank} ${m3RankDisplay} ${isM4WithComparison ? `<span class="trend-icon ${rankTrendClass}">${rankIcon}</span>` : ''}
                            </span>
                            <span class="stat-badge">
                                ${escapeHtml(t('tier.clShare'))}: ${currentShare}% ${m3ShareDisplay} ${isM4WithComparison ? `<span class="trend-icon ${shareTrendClass}">${shareIcon}</span>` : ''}
                            </span>
                            ${listenN > 0 ? `<span class="stat-badge tier-listen-n${duenn ? ' tier-listen-duenn' : ''}"${duenn ? ` title="${duennTitel}"` : ''}>${escapeHtml(listenText)}${duenn ? ` · ${escapeHtml(t('tier.clThinSample'))}` : ''}</span>` : ''}
                        </div>
                    `;
                    
                    const archetypeEscaped = escapeJsStr(archetypeName);
                    
                    html += `
                        <div class="deck-banner-card" role="button" tabindex="0"
                             onclick="navigateToAnalysisWithDeck('${archetypeEscaped}')"
                             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigateToAnalysisWithDeck('${archetypeEscaped}');}"
                             title="Click to open Deck Analysis">
                            ${imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="deck-banner-content">
                                <div class="deck-banner-name">${archetypeName}</div>
                                ${statsHtml}
                            </div>
                        </div>`;
                });
                
                if (isTrending) {
                    html += `
                            </div>
                        </details>
                    </div>`;
                } else {
                    html += `
                        </div>
                    </div>`;
                }
            });
            
            html += '</div>';
            
            // Inject into dedicated mount when available, fallback to prepend.
            const tierMount = document.getElementById('cityLeagueTierSections');
            if (tierMount) {
                tierMount.innerHTML = html;
            } else {
                content.innerHTML = html + content.innerHTML;
            }
        }
        
        /**
         * Render Tier List for Current Meta (Global)
         * Includes Top Archetypes hero section + Tier 1-3 + Rogue banners.
         * Clicking navigates to Deck Analysis (global) tab.
         */
        async function renderCurrentMetaTierList() {
            const container = document.getElementById('currentMetaContent');
            if (!container) return;
            
            // Load CSV data
            let metaData = [];
            let cardDataByArchetype = {};
            const timestamp = Date.now();
            
            try {
                metaData = await fetchAndParseCSV(`${BASE_PATH}limitless_online_decks_comparison.csv?t=${timestamp}`);
                
                // Load card data for images
                const cardsData = await loadCurrentMetaRowsWithFallback({ forceRefresh: true });

                // Group cards by archetype
                cardsData.forEach(card => {
                    const arch = card.archetype;
                    if (!cardDataByArchetype[arch]) cardDataByArchetype[arch] = [];
                    cardDataByArchetype[arch].push(card);
                });

                // Build normalized lookup for fuzzy archetype matching
                // Handles apostrophe differences (N's vs Ns), "ex" suffix, etc.
                window._cardArchetypeNormalizedMap = {};
                const allArchKeys = Object.keys(cardDataByArchetype);
                allArchKeys.forEach(key => {
                    const norm = _normArchName(key);
                    window._cardArchetypeNormalizedMap[norm] = key;
                });
            } catch (e) {
                console.warn('Could not load meta data for tier list:', e);
                return;
            }
            
            if (metaData.length === 0) return;
            
            // Normalisiere alle Decks und sortiere nach Share (absteigend)
            // parseLocaleNumber, nicht parseFloat: die Vergleichsdatei
            // schreibt deutsche Dezimalkommas ("7,76"), und parseFloat
            // schneidet dort ab — aus 7,76 wurde 7, aus 6,04 wurde 6.
            // Sichtbar war das als "Dragapult 6,0 %" neben 5,88 % in den
            // Rohdaten und als die ±1,0-Sprünge in Improvers/Decliners,
            // die aus der Differenz zweier abgeschnittener Ganzzahlen
            // entstanden.
            const normalizedDecks = metaData.map(deck => ({
                archetype: deck.deck_name || deck.archetype,
                share: parseLocaleNumber(deck.new_share, 0),
                new_share: parseLocaleNumber(deck.new_share, 0),
                old_share: parseLocaleNumber(deck.old_share, 0),
                winrate: parseLocaleNumber(deck.new_winrate, 0),
                new_winrate: parseLocaleNumber(deck.new_winrate, 0),
                count_change: parseInt(deck.count_change || 0),
                new_count: parseInt(deck.new_count || 0)
            }));
            normalizedDecks.sort((a, b) => b.share - a.share);

            // ===================== HERO SECTION =====================
            const combinedHeroMap = new Map();
            normalizedDecks.forEach(deck => {
                const archetypeName = String(deck.archetype || '').trim();
                if (!archetypeName) return;

                const mainKey = getCombinedMainArchetypeLabel(archetypeName);
                if (!mainKey) return;

                const deckCount = deck.new_count || 0;
                const winrate = deck.winrate || 0;
                const share = deck.share || 0;

                if (!combinedHeroMap.has(mainKey)) {
                    combinedHeroMap.set(mainKey, {
                        key: mainKey,
                        label: toTitleCaseWords(mainKey),
                        totalCount: 0,
                        totalShare: 0,
                        weightedWinrateSum: 0,
                        variants: [],
                        representativeVariant: archetypeName,
                        representativeDeckCount: 0
                    });
                }

                const group = combinedHeroMap.get(mainKey);
                group.totalCount += deckCount;
                group.totalShare += share;
                group.weightedWinrateSum += winrate * Math.max(1, deckCount);
                group.variants.push(archetypeName);

                if (deckCount > group.representativeDeckCount) {
                    group.representativeVariant = archetypeName;
                    group.representativeDeckCount = deckCount;
                }
            });

            const topHeroArchetypes = Array.from(combinedHeroMap.values())
                .sort((a, b) => b.totalShare - a.totalShare)
                .slice(0, 5)
                .map(item => ({
                    ...item,
                    weightedWinrate: item.totalCount > 0 ? (item.weightedWinrateSum / item.totalCount) : 0
                }));

            let heroHtml = '';
            if (topHeroArchetypes.length > 0) {
                const heroTitle = typeof t === 'function' ? t('currentMeta.topArchetypes') : 'Top Archetypes';
                const heroSubtitle = typeof t === 'function' ? t('currentMeta.topArchetypesSub') : 'Most played deck variants (Global)';

                heroHtml = `
                    <section class="tier-hero-section" aria-label="${heroTitle}">
                        <div class="tier-hero-header">
                            <h2>${heroTitle}</h2>
                            <p>${heroSubtitle}</p>
                        </div>
                        <div class="tier-hero-grid">`;

                topHeroArchetypes.forEach((item, index) => {
                    const representativeCards = fuzzyArchetypeLookup(item.representativeVariant, cardDataByArchetype);
                    const imageUrl = getArchetypeImage(item.representativeVariant, representativeCards);
                    const combinedMainEscaped = escapeJsStr(item.key || item.label || item.representativeVariant || '');
                    const combinedVariantsJsonEscaped = escapeJsStr(encodeURIComponent(JSON.stringify(item.variants || [])));
                    const winrateText = Number.isFinite(item.weightedWinrate) && item.weightedWinrate > 0
                        ? item.weightedWinrate.toFixed(1)
                        : '0.0';
                    const shareText = item.totalShare > 0 ? item.totalShare.toFixed(1) : '0.0';
                    const variantCount = item.variants.length;
                    const variantLabel = variantCount === 1
                        ? (getLang() === 'de' ? 'Variante' : 'Variant')
                        : (getLang() === 'de' ? 'Varianten' : 'Variants');

                    heroHtml += `
                        <div class="tier-hero-card" onclick="navigateToCMAnalysisWithCombinedDeck('${combinedMainEscaped}', '${combinedVariantsJsonEscaped}')">
                            ${imageUrl ? `<div class="tier-hero-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="tier-hero-content">
                                <div class="archetype-card-header">
                                    <span class="archetype-rank-badge">#${index + 1}</span>
                                    <h3 class="archetype-card-title">${item.label}</h3>
                                </div>
                                <div class="tier-hero-meta">${variantCount} ${variantLabel}</div>
                                <div class="tier-hero-stats">
                                    <span class="stat-badge" title="${variantCount > 1
                                        ? (getLang() === 'de'
                                            ? `Summe über ${variantCount} Varianten. Die einzelne Variante steht weiter unten in der Tabelle und ist entsprechend kleiner.`
                                            : `Sum across ${variantCount} variants — the individual variant is smaller and listed in the table below.`)
                                        : (getLang() === 'de' ? 'Eine einzelne Variante' : 'Single variant')}">${
                                        fmtPct(parseFloat(shareText))}${variantCount > 1
                                            ? ` <small class="stat-badge-suffix">${getLang() === 'de'
                                                ? `über ${variantCount} Varianten` : `across ${variantCount} variants`}</small>`
                                            : ''}</span>
                                    <span class="stat-badge" title="${getLang() === 'de' ? 'Gewichtete durchschnittliche Win Rate' : 'Weighted average winrate'}">WR ${fmtPct(parseFloat(winrateText))}</span>
                                </div>
                            </div>
                        </div>`;
                });

                heroHtml += `
                        </div>
                    </section>`;
            }

            // ===================== TIER SECTIONS =====================
            const tierGroups = { 'tier-1': [], 'tier-2': [], 'tier-3': [], 'tier-trending': [] };

            // Best-effort labs tournament data for the current meta. If
            // the per-meta CSV exists, computeTierScore weights it as the
            // strongest signal (user explicit ask: "Sobald wir Labs Daten
            // … haben sollten die natürlich den meisten impact auf die
            // Tier Einordnung haben"). Missing file is fine — score
            // collapses to share + Bayesian-shrunk WR.
            let labsByName = null;
            try {
                const fw = (typeof window !== 'undefined') ? window._formatWindow : null;
                const metaKey = (fw && fw.oldest_legal_set && fw.current_set)
                    ? `${String(fw.oldest_legal_set).toUpperCase()}-${String(fw.current_set).toUpperCase()}`
                    : null;
                if (metaKey) {
                    const labsUrl = `${BASE_PATH}labs_tournament_decks_${metaKey}.csv?t=${timestamp}`;
                    const labsHead = await fetch(labsUrl, { method: 'HEAD' });
                    if (labsHead.ok) {
                        const labsRows = await fetchAndParseCSV(labsUrl);
                        labsByName = aggregateLabsRowsByDeck(labsRows);
                    }
                }
            } catch (_e) { /* labs missing — share + WR only */ }

            // Composite tier score per deck (replaces pure share-DESC
            // sort that landed 44 %-WR Mega Greninja in Tier 1).
            normalizedDecks.forEach(d => { d._tierScore = computeTierScore(d, labsByName); });
            normalizedDecks.sort((a, b) => b._tierScore.score - a._tierScore.score);

            // Tier-Einteilung mit festen Limits und Mindestspielanzahl.
            // Alle Tier 1-3 Decks müssen ≥ 10 % der Spielanzahl des Rang-1-Decks haben
            // (Rang-1 hier = nach Composite-Score, nicht nach Share).
            const _maxCount = normalizedDecks.reduce((m, d) => Math.max(m, d.new_count || 0), 0);
            const minCountThreshold = _maxCount * 0.10;

            const T1_MAX = 6;
            const T2_MAX = 9;
            const T3_MAX = 12;
            const T1_MIN_SHARE = 4.0;   // still must be played
            const T1_MIN_WR    = 49.0;  // shrunk-WR (or labs WR) floor — no "Tier 1 with 44 %"

            let t1 = 0, t2 = 0, t3 = 0;
            normalizedDecks.forEach((deck) => {
                const meetsMinCount = (deck.new_count || 0) >= minCountThreshold;
                const sc = deck._tierScore;
                const labsWR = (sc.labsHit && labsByName && labsByName[deck.archetype])
                    ? (labsByName[deck.archetype].winPct || 0) : 0;
                // Quality gate for Tier 1: either the Bayesian-shrunk
                // online WR or the labs tournament WR has to clear 49 %.
                // Without this floor, popular-but-losing decks
                // (Mega Greninja 6 %/44 % case) stay in Tier 1 just
                // for being played a lot.
                //
                // BEIDE Werte muessen auf derselben Skala liegen, bevor sie
                // gegen dieselbe Schwelle geprueft werden. sc.adjWR beruht auf
                // deck.winrate, also der Ladder-Konvention W/(W+L+T);
                // labsWR kam bis zum 17.08.2026 aus einer dritten Formel und
                // lag dadurch systematisch hoeher — die Huerde war auf der
                // Labs-Seite rund 2,4 pp weicher, und welcher Pfad griff, hing
                // allein davon ab, ob eine Labs-Datei existierte. labsByName
                // liefert jetzt winPct in derselben Konvention wie die Ladder.
                const wrFloorOK = sc.adjWR >= T1_MIN_WR || labsWR >= T1_MIN_WR;
                const tier1Eligible = meetsMinCount
                                   && deck.share >= T1_MIN_SHARE
                                   && wrFloorOK;

                if (t1 < T1_MAX && tier1Eligible) {
                    tierGroups['tier-1'].push(deck);
                    t1++;
                } else if (t2 < T2_MAX && meetsMinCount) {
                    tierGroups['tier-2'].push(deck);
                    t2++;
                } else if (t3 < T3_MAX && meetsMinCount) {
                    tierGroups['tier-3'].push(deck);
                    t3++;
                } else {
                    tierGroups['tier-trending'].push(deck);
                }
            });
            
            const tierTitles = {
                'tier-1':        { title: 'Tier 1',           subtitle: t('tier.sub1')     },
                'tier-2':        { title: 'Tier 2',           subtitle: t('tier.sub2')     },
                'tier-3':        { title: 'Tier 3',           subtitle: t('tier.sub3')     },
                // "Aufkommende Archetypen" war eine Aussage ueber die Zukunft
                // dieser Decks. Was den Block wirklich zusammenhaelt, ist,
                // dass sie unter den Tier-Schwellen liegen — und dass ihre
                // Zahlen auf den duennsten Stichproben der Seite stehen.
                'tier-trending': { title: 'Rogue / Trending',  subtitle: t('tier.cmSubRogue') }
            };
            
            // Limit trending decks to top 20
            if (tierGroups['tier-trending'].length > 20) {
                tierGroups['tier-trending'] = tierGroups['tier-trending'].slice(0, 20);
            }

            // ============================================================
            // Live deck-name filter — user types, cards hide instantly.
            // Filter runs against data-deck-name on every .deck-banner-
            // card, so it works across all four tier sections + the
            // hero section without needing a re-render.
            // ============================================================
            const filterHtml = `
                <div class="tier-search-row">
                    <input type="search" class="tier-search-input"
                           placeholder="${escapeHtml(t('tier.searchPlaceholder'))}"
                           aria-label="${escapeHtml(t('tier.searchAria'))}"
                           oninput="filterTierDeckCards(this.value)">
                    <span class="tier-search-clear" onclick="this.previousElementSibling.value=''; filterTierDeckCards('');" title="${escapeHtml(t('tier.clearFilter'))}">✕</span>
                </div>`;

            // ============================================================
            // Side-by-side Overall vs Top-8 panel — pulls from the new
            // online_tournament_top8_decks.csv (Predictor 2.0 source).
            // Graceful fallback to empty string when the CSV isn't
            // available yet (older deploys / fresh clones). Stacks
            // vertically on mobile via CSS.
            // ============================================================
            let overallTop8Html = '';
            let fieldConv = null;   // Feld-Durchschnitt für die Kennzahl-Kachel
            try {
                const t8resp = await fetch(`${BASE_PATH}online_tournament_top8_decks.csv?t=${timestamp}`);
                if (t8resp.ok) {
                    const t8rows = await fetchAndParseCSV(`${BASE_PATH}online_tournament_top8_decks.csv?t=${timestamp}`);
                    const totalBrought = t8rows.reduce((s, r) => s + parseLocaleNumber(r.total_brought_weighted || '0', 0), 0) || 1;
                    const enriched = t8rows.map(r => {
                        const brought = parseLocaleNumber(r.total_brought_weighted || '0', 0);
                        const top8 = parseLocaleNumber(r.top8_count_weighted || '0', 0);
                        return {
                            name: r.deck_name,
                            broughtPct: (brought / totalBrought) * 100,
                            brought: brought,
                            top8: top8,
                            top8ConvPct: parseLocaleNumber(r.top8_conv_rate || '0', 0) * 100,
                        };
                    });
                    // Hier standen bis zum 20.08.2026 drei Ranglisten
                    // (overallTop, top8Top, convTop) und ein renderRow. Die
                    // drei Tabellen sind am 19.08. in der Meta-Performance
                    // aufgegangen; die Variablen blieben stehen und wurden von
                    // niemandem mehr gelesen. Gefaehrlich war daran nicht der
                    // tote Code, sondern der gruene Test darauf: er suchte den
                    // Mindeststichproben-Filter per Regex im Quelltext und
                    // bezeugte damit eine Schranke, die in keiner gerenderten
                    // Zeile mehr wirkte. Die Schranke gilt jetzt dort, wo sie
                    // gebraucht wird — in der Faktor-Spalte, und der Test ruft
                    // die Zellenfunktion auf, statt nach ihr zu greppen.

                    // Top-8 vs. expected — its own full-width block, not a
                    // third column: .cm-vs-top8-row is a 1fr 1fr grid and the
                    // tables are table-layout:fixed with !important column
                    // widths (css/styles.css:9451+), so a third column would
                    // get no width at all. It also wants a different ranking
                    // — the point is the decks that do NOT lead on count.
                    const conv = computeConversionPerformance(t8rows);
                    fieldConv = conv;
                    // Ranked among decks with a usable sample. Shrinkage
                    // stops a 2-entry deck from topping the list, but it
                    // cannot make one INFORMATIVE: unfiltered, six of the
                    // top twelve had between 3 and 17 appearances, and
                    // "Lopunny Dusknoir, 40 % top-8 rate, n=3" answers
                    // nothing. Below the floor a deck is left out of the
                    // list, not out of the field average.

                    // escapeHtml (not escapeJsStr) — these names go straight
                    // into innerHTML, so apostrophes in "N's Zoroark" or
                    // "Cynthia's Garchomp" must turn into &#39; and not
                    // a backslash-escaped \' the way escapeJsStr emits.
                    // Datentabelle aus components.css: eine Klasse, keine
                    // Spaltenbreiten, keine !important. Die Elternregel
                    // #currentMetaContent .section table nimmt .ds-table
                    // per :not() aus, statt dass hier dagegen
                    // angeschrieben wird.
                    // n gehört in die Zeile, nicht in die Fußnote. Diese beiden
                    // Tabellen zeigten bisher nur Rang, Name und Wert — und
                    // werden als Rangliste gelesen. Platz 1 war zeitweise ein
                    // Deck mit 8 gewichteten Cuts, dessen 95-%-Wilson-Intervall
                    // von 7,9 % bis 27,1 % reicht. Die Nachbartabelle
                    // "Top-8 vs. Erwartung" macht es seit jeher richtig; hier
                    // fehlte es.
                    // Unter CONV_THIN_N wird die Zeile ausgegraut — dieselbe
                    // Konvention wie dort, damit "dünn" überall gleich aussieht.
                    // EINE Rangliste statt drei Auswertungen.
                    //
                    // Bis zum 19.08.2026 standen hier nebeneinander:
                    //   "Wie oft gespielt"        Rang, Deck, Anteil, n
                    //   "Wie oft Top-8 erreicht"  Rang, Deck, Top-8-Quote, n
                    //   "Top 8 gegen Erwartung"   Rang, Deck, Top-8-Quote, vs. Feld
                    //
                    // Dreimal dieselben Decks, dreimal dieselben Spalten in
                    // anderer Reihenfolge, ueber drei Bildschirmhoehen verteilt.
                    // Beanstandet mit: "wir brauchen jetzt nicht drei
                    // verschiedene Felder fuer das Gleiche — mach lieber eine
                    // draus, und dann so, dass man sortieren kann."
                    //
                    // Dazu kam ein echter Fehler: die Spalte n der mittleren
                    // Tabelle zeigte d.brought, also ALLE Antritte des Decks.
                    // Neben einer Top-8-Quote gelesen sah das aus, als haetten
                    // 772 Decks die Top 8 erreicht. Gemeint waren 78. Die neue
                    // Tabelle hat beide Zahlen als eigene Spalten, damit die
                    // Verwechslung gar nicht erst moeglich ist.
                    const deR = getLang() === 'de';
                    const perfVon = new Map((conv.decks || []).map(d => [d.name, d.perfPct]));
                    // Der ROHE Faktor derselben Zeile. Die Spalte "Top 8 ggue. Oe"
                    // zeigt den geglaetteten Wert (k = 50 Pseudo-Antritte am
                    // Feld-Durchschnitt), die Top-8-Quote unmittelbar daneben ist
                    // roh — in 108 von 120 Zeilen weichen beide auf eine
                    // Nachkommastelle ab. Mega Greninja: roh 0,12-mal, angezeigt
                    // 0,4-mal. Wer die Quote durch den Feld-Durchschnitt teilt,
                    // bekommt etwas anderes als die Nachbarspalte und haelt sich
                    // fuer zu dumm zum Rechnen. Beide Zahlen stehen jetzt an der
                    // Zelle, und die Spalte erklaert die Glaettung im Kopf.
                    const rohVon = new Map((conv.decks || []).map(d => [d.name, d.rawPct]));

                    // ZWEI Zaehlungen desselben Feldes, und beide gehoeren hierher.
                    //
                    // Gemeldet am 19.08.2026: "Du hast hier Mega Excadrill 7,8 %
                    // Anteil mit 673 Antritten. Unten in der Liste steht aber ein
                    // Deckcount von 2121 und eine Winrate von 49 %. Irgendwie
                    // gehen da die Daten auseinander."
                    //
                    // Sie gehen nicht auseinander — es sind zwei verschiedene
                    // Groessen, die bis heute in zwei getrennten Tabellen standen
                    // und deshalb wie ein Widerspruch aussahen:
                    //
                    //   data/online_tournament_top8_decks.csv
                    //       672,5 gewichtete TURNIER-Antritte, 31 davon Top 8
                    //       Summe ueber alle Decks: 8.574
                    //   data/limitless_online_decks.csv  (via normalizedDecks)
                    //       2.121 DECKLISTEN auf der Online-Ladder, 49,46 % WR
                    //       Summe ueber alle Decks: 26.319
                    //
                    // Der Anteil ist in beiden fast gleich (7,8 gegen 7,75 %) —
                    // dasselbe Feld, anders gezaehlt. 113 der 131 Decks stehen in
                    // beiden Dateien; wo eine fehlt, steht ein Strich statt einer
                    // erfundenen Zahl.
                    //
                    // Damit faellt die "Vollstaendige Tabelle" als eigener
                    // Abschnitt weg: sie zeigte genau die Ladder-Spalten, die
                    // jetzt hier stehen.
                    const ladderVon = new Map((normalizedDecks || []).map(d => [d.archetype, d]));
                    const alleNamen = new Set([
                        ...enriched.map(d => d.name),
                        ...(normalizedDecks || []).map(d => d.archetype),
                    ]);
                    const turnierVon = new Map(enriched.map(d => [d.name, d]));

                    const reihen = [...alleNamen].map(name => {
                        const t = turnierVon.get(name) || null;
                        const l = ladderVon.get(name) || null;
                        const antritte = t ? t.brought : null;
                        return {
                            name,
                            listen:  l ? l.new_count : null,
                            anteil:  l ? l.share : (t ? t.broughtPct : null),
                            anteilAusTurnier: !l && !!t,
                            wr:      l && l.winrate > 0 ? l.winrate : null,
                            antritte,
                            quote:   t ? t.top8ConvPct : null,
                            cuts:    t ? t.top8 : null,
                            faktor:  perfVon.has(name) ? 1 + perfVon.get(name) / 100 : null,
                            faktorRoh: rohVon.has(name) ? 1 + rohVon.get(name) / 100 : null,
                            // Duenn heisst hier: zu wenig TURNIER-Antritte, um die
                            // Top-8-Quote zu glauben. Die Ladder-Spalten sind davon
                            // unberuehrt, die stehen auf 2.121 Listen.
                            duenn: !(antritte >= CONV_THIN_N),
                            rang: l ? (l.new_count || 0) : 0,
                        };
                    });

                    const SPALTEN = [
                        { k: 'name',     de: 'Deck',          en: 'Deck',        num: false },
                        { k: 'listen',   de: 'Listen',        en: 'Lists',       num: true,
                          tip: { de: 'Decklisten auf der Online-Ladder', en: 'decklists on the online ladder' } },
                        { k: 'anteil',   de: 'Anteil',        en: 'Share',       num: true, hilf: 'share' },
                        { k: 'wr',       de: 'Win Rate',      en: 'Win rate',    num: true,
                          tip: { de: 'gewonnene Partien auf der Ladder', en: 'games won on the ladder' } },
                        { k: 'antritte', de: 'Antritte',      en: 'Entries',     num: true,
                          tip: { de: 'gewichtete Turnier-Antritte', en: 'weighted tournament entries' } },
                        { k: 'cuts',     de: 'davon Top 8',   en: 'made top 8',  num: true },
                        { k: 'quote',    de: 'Top-8-Quote',   en: 'Top-8 rate',  num: true, hilf: 'top8' },
                        // hilf statt tip: TERMS.vsField sagt beides — was 1,6-mal
                        // heisst UND dass kleine Stichproben geglaettet werden.
                        // Der Text stand seit jeher im File und wurde von keiner
                        // Stelle benutzt; angehaengt war der kurze tip, der die
                        // Glaettung verschweigt.
                        { k: 'faktor',   de: 'Top 8 ggü. Ø',  en: 'Top 8 vs. avg', num: true, hilf: 'vsField' },
                    ];

                    const zelle = (r, k) => {
                        if (k === 'name')     return escapeHtml(r.name);
                        if (k === 'listen')   return r.listen   == null ? '–' : fmtNumDS(r.listen);
                        if (k === 'anteil') {
                            if (r.anteil == null) return '–';
                            const txt = fmtPct(r.anteil);
                            return r.anteilAusTurnier
                                ? `<em title="${escapeHtml(deR
                                    ? 'Anteil an den gewichteten Turnier-Antritten — dieses Deck hat keine Ladder-Zeile'
                                    : 'Share of weighted tournament entries — this deck has no ladder row')}">${txt}</em>`
                                : txt;
                        }
                        if (k === 'wr')       return r.wr       == null ? '–' : fmtPct(r.wr);
                        if (k === 'antritte') return r.antritte == null ? '–' : fmtHalb(r.antritte);
                        if (k === 'quote')    return r.quote    == null ? '–' : fmtPct(r.quote);
                        if (k === 'cuts')     return r.cuts     == null ? '–' : fmtHalb(r.cuts);
                        if (r.faktor == null) return '–';
                        // Unter CONV_MIN_N gewichteten Antritten ist die Zahl der
                        // Prior, nicht die Schaetzung: 23 Decks ohne einen
                        // einzigen Cut standen mit "1,0-mal" und einem Balken auf
                        // der Nulllinie da — das liest sich als "genau
                        // Durchschnitt" und heisst "wir wissen nichts". Die Zeile
                        // bleibt, ihre Antritte zaehlen weiter in den
                        // Feld-Durchschnitt; nur der Faktor schweigt.
                        if (!(r.antritte >= CONV_MIN_N)) {
                            return `<span class="cm-rang-wert" title="${escapeHtml(deR
                                ? 'Unter ' + CONV_MIN_N + ' gewichteten Antritten — zu wenig fuer eine Schaetzung'
                                : 'Fewer than ' + CONV_MIN_N + ' weighted entries — too little for an estimate')}">–</span>`;
                        }
                        const einsNK = (v) => v.toLocaleString(deR ? 'de-DE' : 'en-US',
                            { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                        const txt = einsNK(r.faktor) + (deR ? '-mal' : '×');
                        const titel = r.faktorRoh == null ? '' : escapeHtml(deR
                            ? `geglättet (k = ${CONV_PRIOR}); roh ${einsNK(r.faktorRoh)}-mal`
                            : `smoothed (k = ${CONV_PRIOR}); raw ${einsNK(r.faktorRoh)}×`);
                        // Der divergierende Balken aus components.css: Nulllinie in
                        // der Mitte, blau nach oben, rot nach unten. Er zeigt auf
                        // einen Blick, wer ueber dem Schnitt liegt. Er traegt keine
                        // Ziffern, darum liest die Sortierung weiter die Zahl aus
                        // dem Text der Zelle.
                        const abw = (r.faktor - 1) * 100;
                        const breite = Math.min(Math.abs(abw), CONV_CAP) / CONV_CAP * 50;
                        const posi = abw >= 0;
                        return `<span class="cm-rang-wert"${titel ? ` title="${titel}"` : ''}>${txt}</span>`
                            + `<span class="ds-bar-track is-diverging">`
                            + `<span class="ds-bar-fill ${posi ? 'is-pos' : 'is-neg'}"`
                            + ` style="width:${breite.toFixed(1)}%"></span></span>`;
                    };

                    // Nach Listen, absteigend. Das ist dieselbe Reihenfolge,
                    // die die "Vollstaendige Tabelle" hatte — sie ist hier
                    // aufgegangen, und wer sie gewohnt war, findet sie wieder.
                    reihen.sort((x, y) => (y.listen || 0) - (x.listen || 0)
                                       || (y.anteil || 0) - (x.anteil || 0));

                    const kopfZellen = SPALTEN.map(c => {
                        const txt = deR ? c.de : c.en;
                        const beschriftet = c.hilf ? hintTerm(txt, term(c.hilf))
                                          : (c.tip ? hintTerm(txt, deR ? c.tip.de : c.tip.en)
                                                   : escapeHtml(txt));
                        return `<th class="${c.num ? 'ds-num ' : ''}cm-rang-th" data-rang-spalte="${c.k}"
                                    role="button" tabindex="0" aria-sort="${c.k === 'listen' ? 'descending' : 'none'}"
                                    title="${escapeHtml(deR ? 'Nach dieser Spalte sortieren' : 'Sort by this column')}">${
                                    beschriftet}<span class="cm-rang-pfeil" aria-hidden="true"></span></th>`;
                    }).join('');

                    // Vorne die Decks, ueber die es etwas zu sagen gibt; der Rest
                    // auf Knopfdruck. Die "Vollstaendige Tabelle" hiess so, weil
                    // sie JEDEN Archetyp zeigte, auch den mit einem einzigen
                    // Antritt — das bleibt moeglich, kostet aber nicht mehr
                    // standardmaessig 138 Zeilen Seitenhoehe.
                    const SICHTBAR = 25;
                    const ladderSumme = (normalizedDecks || [])
                        .reduce((sum, d) => sum + (d.new_count || 0), 0);
                    const zeilen = reihen.map((r, i) => `
                        <tr class="${r.duenn ? 'is-muted' : ''}${i >= SICHTBAR ? ' cm-rang-mehr' : ''}"${
                            i >= SICHTBAR ? ' hidden' : ''}>
                            <td class="ds-rank">${i + 1}</td>
                            ${SPALTEN.map(c => `<td class="${c.num ? 'ds-num' : ''}">${zelle(r, c.k)}</td>`).join('')}
                        </tr>`).join('');
                    const versteckt = Math.max(0, reihen.length - SICHTBAR);

                    overallTop8Html = `
                        <div class="ds-panel cm-rangliste-block">
                            <h3 class="ds-label">🏆 ${deR ? 'Meta-Performance' : 'Meta performance'}</h3>
                            <p class="ds-note cm-rang-hinweis">${deR
                                ? 'Eine Zeile je Deck, jede Spaltenüberschrift sortiert. '
                                  + '<strong>Listen</strong> und <strong>Win Rate</strong> kommen von der Online-Ladder '
                                  + '(' + fmtNumDS(ladderSumme) + ' Decklisten), <strong>Antritte</strong> und '
                                  + '<strong>Top 8</strong> aus den Turnieren (' + fmtNumDS(conv.totalBrought)
                                  + ' gewichtete Antritte). Zwei Zählungen desselben Feldes — darum ist der Anteil '
                                  + 'in beiden fast gleich, die Stückzahlen aber nicht. Ein Strich heißt: dieses Deck '
                                  + 'steht in der einen Datei und in der anderen nicht. Blasse Zeilen haben unter '
                                  + CONV_THIN_N + ' Turnier-Antritte — dort ist die Top-8-Quote noch wackelig. '
                                  + 'Der <strong>Feld-Durchschnitt</strong>, gegen den die letzte Spalte vergleicht, '
                                  + 'liegt bei ' + fmtPct(conv.expected * 100, 1) + ' Top-8-Quote. Die letzte Spalte '
                                  + 'selbst ist geglättet (k = ' + CONV_PRIOR + '), die Top-8-Quote daneben ist roh; '
                                  + 'beide Werte stehen im Tooltip der Zelle. Unter ' + CONV_MIN_N + ' Antritten steht '
                                  + 'dort ein Strich statt einer Zahl, die nur den Durchschnitt wiederholt. Antritte '
                                  + 'werden nach Turnieralter gewichtet, halbe Werte sind deshalb echt und keine Rundung.'
                                : 'One row per deck, every column heading sorts. <strong>Lists</strong> and '
                                  + '<strong>win rate</strong> come from the online ladder (' + fmtNumDS(ladderSumme)
                                  + ' decklists), <strong>entries</strong> and <strong>top 8</strong> from tournaments ('
                                  + fmtNumDS(conv.totalBrought) + ' weighted entries). Two counts of the same field — '
                                  + 'which is why the share matches but the totals do not. A dash means the deck is in '
                                  + 'one file and not the other. Faded rows have fewer than ' + CONV_THIN_N
                                  + ' tournament entries. The <strong>field average</strong> the last column compares '
                                  + 'against is ' + fmtPct(conv.expected * 100, 1) + ' top-8 rate. That column is '
                                  + 'smoothed (k = ' + CONV_PRIOR + ') while the top-8 rate beside it is raw; the cell '
                                  + 'tooltip carries both. Below ' + CONV_MIN_N + ' entries it shows a dash instead of '
                                  + 'a number that merely repeats the average. Entries are weighted by tournament age, '
                                  + 'so half values are real, not a rounding artefact.'}</p>
                            <div class="mobile-table-scroll">
                                <table class="ds-table cm-rangliste" data-rang-sortiert="listen" data-rang-richtung="ab">
                                    <thead><tr><th class="ds-rank">#</th>${kopfZellen}</tr></thead>
                                    <tbody>${zeilen}</tbody>
                                </table>
                            </div>
                            ${versteckt > 0 ? `
                            <div class="cm-rang-mehr-zeile">
                                <button type="button" class="ds-btn cm-rang-mehr-btn"
                                        data-rang-mehr="${versteckt}"
                                        data-mehr-text="${escapeHtml(deR ? 'Alle ' + reihen.length + ' Decks zeigen' : 'Show all ' + reihen.length + ' decks')}"
                                        data-weniger-text="${escapeHtml(deR ? 'Nur die Top ' + SICHTBAR + ' zeigen' : 'Show only the top ' + SICHTBAR)}">${
                                        escapeHtml(deR ? 'Alle ' + reihen.length + ' Decks zeigen' : 'Show all ' + reihen.length + ' decks')}</button>
                            </div>` : ''}
                        </div>`;
                }
            } catch (_e) {
                // Nicht mehr stumm: derselbe try/catch hat gerade drei
                // Tabellen verschluckt, weil ein Helfer überdeckt war.
                // Fehlt die CSV, ist die Warnung genauso richtig.
                console.warn('Top-8-Block konnte nicht gerendert werden:', _e && _e.message);
            }

            // ============================================================
            // Performance Improvers / Decliners (TrainerHill pattern).
            // Filters decks where share moved >= 0.4 percentage points
            // since the previous comparison snapshot. Top 5 each side.
            // ============================================================
            const movers = normalizedDecks
                .filter(d => d.old_share > 0 && Math.abs((d.share || 0) - d.old_share) >= 0.4)
                .map(d => ({
                    archetype: d.archetype,
                    share: d.share || 0,
                    oldShare: d.old_share,
                    delta: (d.share || 0) - d.old_share,
                    winrate: d.winrate || 0,
                }));
            // Split by sign FIRST, sort within each side. Without the
            // sign filter, a single mover with delta > 0 ended up in
            // both lists (improvers got the top-5-by-desc which
            // included it as +1.0, decliners got the top-5-by-asc
            // which also included it because there were < 5 candidates
            // on the negative side). Visible regression: N's Zoroark
            // shown as +1.0 % in Improvers AND -1.0 % in Decliners
            // with identical Share/Prev numbers.
            const improvers = movers.filter(m => m.delta > 0)
                                    .sort((a, b) => b.delta - a.delta)
                                    .slice(0, 5);
            const decliners = movers.filter(m => m.delta < 0)
                                    .sort((a, b) => a.delta - b.delta)
                                    .slice(0, 5);

            const renderMoverRow = (m, sign) => {
                const delta = (typeof window.formatPercentSigned === 'function')
                    ? window.formatPercentSigned(m.delta)
                    : (m.delta >= 0 ? '+' : '') + m.delta.toFixed(1) + '%';
                // Getoente Zelle statt farbigem Text — der Baustein dafuer
                // steht schon in css/components.css und garantiert, dass
                // der Kontrast der Zahl unabhaengig vom Wert bleibt.
                const cls = sign === 'up' ? 'ds-tint-pos' : 'ds-tint-neg';
                return `<tr>
                    <td>${escapeHtml(m.archetype)}</td>
                    <td class="ds-num">${fmtPct(m.share)}</td>
                    <td class="ds-num">${fmtPct(m.oldShare)}</td>
                    <td class="ds-num tier-mover-delta ${cls}">${delta}</td>
                </tr>`;
            };

            // Always render BOTH blocks side-by-side, even when one or both
            // are empty. Showing only "Festival Lead +1.0%" as the single
            // improver looked like a rendering error. A friendly empty
            // state makes the sparse-data case explicit.
            const emptyMoversNotice = `
                <div class="tier-movers-empty">
                    <span class="tier-movers-empty-icon">📋</span>
                    <span>Zu wenig Bewegung diese Woche (≥ 0,4 pp Veränderung).</span>
                </div>`;
            const deMv = getLang() === 'de';
            const renderMoverBlock = (title, list, sign) => `
                <div class="ds-panel tier-movers-block tier-movers-${sign === 'up' ? 'improvers' : 'decliners'}">
                    <h3 class="ds-label">${title}</h3>
                    ${list.length > 0
                      ? `<table class="ds-table">
                            <thead><tr><th>Deck</th>
                                <th class="ds-num">${hintTerm(deMv ? 'Anteil' : 'Share', term('share'))}</th>
                                <th class="ds-num">${hintTerm(deMv ? 'Vorher' : 'Prev', term('prev'))}</th>
                                <th class="ds-num">${hintTerm('Δ', term('delta'))}</th></tr></thead>
                            <tbody>${list.map(m => renderMoverRow(m, sign)).join('')}</tbody>
                         </table>`
                      : emptyMoversNotice}
                </div>`;
            let moversHtml = `
                <div class="tier-movers-row">
                    ${renderMoverBlock('📈 Performance Improvers', improvers, 'up')}
                    ${renderMoverBlock('📉 Performance Decliners', decliners, 'down')}
                </div>`;
            // If BOTH sides are empty, replace the whole row with one
            // clean note so we don't render two empty boxes.
            if (improvers.length === 0 && decliners.length === 0) {
                moversHtml = `
                <div class="tier-movers-row tier-movers-row--empty">
                    <div class="tier-movers-block tier-movers-block--full-empty">
                        <span class="tier-movers-empty-icon">📋</span>
                        <span>Diese Woche keine signifikanten Share-Bewegungen (≥ 0,4 pp). Schau morgen wieder vorbei.</span>
                    </div>
                </div>`;
            }

            // ============================================================
            // Data-Source transparency box. TrainerHill-inspired metadata
            // strip telling the user how many deck entries / archetypes
            // back the snapshot — builds confidence in the numbers.
            // ============================================================
            const totalDecks   = normalizedDecks.length;
            const totalEntries = normalizedDecks.reduce((s, d) => s + (d.new_count || 0), 0);
            // Der Rest, den niemand ausweist.
            //
            // Die gelisteten Anteile summieren sich auf 96,19 %, nicht auf 100.
            // Limitless fuehrt alles unterhalb seiner Namensschwelle als
            // "Other" — am 20.08.2026 waren das 1.038 Listen —, und
            // backend/scrapers/limitless_online_scraper.py:152 wirft diese
            // Zeile weg. Keine angezeigte Zahl ist dadurch falsch: 26.319 ist
            // die richtige Zahl gelisteter Listen, und 7,75 % ist der richtige
            // Anteil am Feld. Nur passte beides bisher nicht zusammen, weil
            // der Nenner der Prozentzahl (27.357) nirgends stand.
            // feldGroesseAusAnteilen grenzt den Nenner ein, den Limitless
            // benutzt hat; die Herleitung steht im Kopf der Funktion.
            const feldGesamt = (typeof window.feldGroesseAusAnteilen === 'function')
                ? window.feldGroesseAusAnteilen(normalizedDecks.map(
                    d => ({ anteil: d.share || 0, anzahl: d.new_count || 0 })))
                : 0;
            const restAnteil = feldGesamt > totalEntries
                ? (feldGesamt - totalEntries) / feldGesamt * 100 : 0;
            // Die Datenbasis als Kennzahl-Kacheln statt als Fließtextzeile:
            // dieselben Zahlen, aber lesbar, ohne den Satz zu entziffern.
            // Drei Kacheln aus components.css, keine eigene Regel.
            const deDS = getLang() === 'de';

            // Die Turnierzahlen standen bisher im Abschnitt "Ueberblick" ganz
            // unten, in einer lila Kachel, auf Englisch, hinter zwei weiteren
            // Abschnitten. Gemeldet: "die Ueberblick koennen wir rausnehmen,
            // wenn wir davon noch Daten verwenden wollen, dann koennen wir die
            // oben mit reinnehmen". Genau eine Angabe daraus ist es wert: woraus
            // die 26.319 Listen eigentlich bestehen.
            // Diese Zeile darf nur erscheinen, wenn sie zu den Listen daneben passt.
            //
            // GEMESSEN am 20.08.2026: data/limitless_meta_stats.json war seit dem
            // 20.04.2026 unveraendert — vier Monate. Der Scraper schreibt die Datei
            // nach backend/core/data/ (limitless_online_scraper.py:133), aber sie
            // stand nicht in SYNC_PATTERNS und kam deshalb nie in data/ an. Die
            // Kachel behauptete also "26.319 Listen aus 199 Turnieren", wobei die
            // 26.319 woechentlich frisch waren und die 199 aus dem April stammten.
            // Die Partienzahl war zusaetzlich in sich falsch: 119.820
            // Partie-Eintraege in den Matchup-Daten sind mindestens 59.910
            // gespielte Partien, angezeigt wurden 31.411.
            //
            // Zwei Sachen sind dagegen noetig, und beide gehoeren hierher:
            //   1. die Datei muss ankommen (SYNC_PATTERNS, siehe backend/core/
            //      prepare_card_data.py) — das behebt die Ursache;
            //   2. die Anzeige darf sich darauf nicht verlassen — das behebt den
            //      Schaden, auch wenn der naechste Lauf wieder ausfaellt.
            //
            // Punkt 2 steht hier: ohne generated_at, oder wenn der Stand aelter
            // ist als die Deckdatei, faellt die Zeile weg. Lieber keine Herkunft
            // als eine falsche — eine Zahl ohne Beleg ist besser als eine Zahl
            // mit dem Beleg eines anderen Tages.
            const HOECHSTALTER_TAGE = 14;
            let metaStats = null;
            let metaStatsStand = null;
            try {
                const ms = await fetch(`${BASE_PATH}limitless_meta_stats.json?t=${timestamp}`);
                if (ms.ok) {
                    const j = await ms.json();
                    const z = (v) => parseInt(v, 10) || 0;
                    const stand = j.generated_at ? new Date(j.generated_at) : null;
                    const frisch = stand && !isNaN(stand.getTime())
                        && (Date.now() - stand.getTime()) / 86400000 <= HOECHSTALTER_TAGE;
                    if (z(j.tournaments) > 0 && frisch) {
                        metaStats = { turniere: z(j.tournaments), spieler: z(j.players), partien: z(j.matches) };
                        metaStatsStand = stand;
                    } else if (z(j.tournaments) > 0) {
                        console.warn('limitless_meta_stats.json ist zu alt oder ohne Stand '
                            + '(generated_at=' + (j.generated_at || 'fehlt') + ') — Herkunftszeile bleibt weg');
                    }
                }
            } catch (e) {
                // Fehlt die Datei, bleibt die Kachel bei ihrer kurzen Zeile.
                console.warn('limitless_meta_stats.json nicht geladen:', e && e.message);
            }
            const statTile = (label, value, unit, context) => `
                <div class="ds-stat">
                    <span class="ds-stat-label">${escapeHtml(label)}</span>
                    <span class="ds-stat-value">${value}${unit ? `<span class="ds-stat-unit">${unit}</span>` : ''}</span>
                    <span class="ds-stat-context">${escapeHtml(context)}</span>
                </div>`;
            const dataSourceHtml = `
                <div class="ds-stat-row">
                    ${statTile(deDS ? 'Gemeldete Listen' : 'Reported lists',
                        totalEntries.toLocaleString(deDS ? 'de-DE' : 'en-US'), '',
                        (metaStats
                            ? (deDS
                                ? `aus ${fmtNumDS(metaStats.turniere)} Turnieren · ${fmtNumDS(metaStats.spieler)} Spieler · ${fmtNumDS(metaStats.partien)} Partien`
                                  + ` (Stand ${metaStatsStand.toLocaleDateString('de-DE')})`
                                : `from ${fmtNumDS(metaStats.turniere)} tournaments · ${fmtNumDS(metaStats.spieler)} players · ${fmtNumDS(metaStats.partien)} matches`
                                  + ` (as of ${metaStatsStand.toLocaleDateString('en-GB')})`)
                            : (deDS ? 'einzelne Decklisten, nicht Deckarten' : 'individual decklists, not deck types'))
                        + (restAnteil > 0
                            ? (deDS
                                ? ` · ${fmtPct(100 - restAnteil, 1)} von ${fmtNumDS(feldGesamt)} Listen im Feld;`
                                  + ` die uebrigen ${fmtNumDS(feldGesamt - totalEntries)} (${fmtPct(restAnteil, 1)})`
                                  + ' fuehrt Limitless als "Other" und meldet sie nicht einzeln'
                                : ` · ${fmtPct(100 - restAnteil, 1)} of ${fmtNumDS(feldGesamt)} lists in the field;`
                                  + ` the remaining ${fmtNumDS(feldGesamt - totalEntries)} (${fmtPct(restAnteil, 1)})`
                                  + ' Limitless files as "Other" and does not report them individually')
                            : ''))}
                    ${statTile(deDS ? 'Archetypen' : 'Archetypes',
                        String(totalDecks), '',
                        deDS ? 'mindestens ein gemeldetes Deck' : 'at least one reported deck')}
                    ${(() => {
                        // Dritte Kachel: wie eng ist das Feld?
                        //
                        // Hier stand der Feld-Durchschnitt (6,20 % Top-8-Quote).
                        // Der steht seit dem 19.08.2026 schon im Satz darueber
                        // — zweimal dieselbe Zahl auf einem Bildschirm war der
                        // Grund fuer die Rueckmeldung "entscheide Dich fuer eine
                        // Zahl". Also eine, die sonst nirgends steht.
                        //
                        // Und "Decks im Feld" hiess es fuer 26.319 Eintraege,
                        // obwohl es nur 131 Deckarten gibt. Gemeldet: "jetzt
                        // sind ja nicht 26.000 verschiedene Decks, wir haben
                        // 26.000 verschiedene Listen." Jetzt heisst es so.
                        // fieldConv, nicht enriched: enriched steht mit const
                        // im try-Block oben und ist hier nicht mehr im Scope.
                        // Beim ersten Versuch stand hier enriched — das haette
                        // die ganze Kachelreihe mit einem ReferenceError
                        // gerissen, still, weil ein try/catch darum liegt.
                        if (!fieldConv || !(fieldConv.totalBrought > 0)) return '';
                        const top = [...(fieldConv.decks || [])].sort((x, y) => y.brought - x.brought);
                        const acht = top.slice(0, 8).reduce((sum, d) => sum + d.brought, 0)
                                     / fieldConv.totalBrought * 100;
                        if (!(acht > 0)) return '';
                        // "Die acht groessten" war zwar deutsch, aber niemand
                        // sagt das. Gemeldet: "man wuerde hier von Top 8
                        // Archetypes sprechen … die englischen Woerter, die in
                        // der Community benutzt werden, sollten wir schon
                        // benutzen." Meta, Top 8 und Archetype sind genau solche.
                        return statTile(deDS ? 'Top 8 Archetypes' : 'Top 8 archetypes',
                            fmtPct(acht, 0), '',
                            deDS
                                ? `des Feldes — ${totalDecks} Archetypen insgesamt`
                                : `of the field — ${totalDecks} archetypes in total`);
                    })()}
                </div>`;

            // Die Basis, auf der JEDE Quote dieser Ansicht beruht, wandert in
            // den Datenraum-Ausweis über dem Tab. Vorher standen hier vier
            // Feldgrößen nebeneinander (22.699 / 23.613 / 7.456 / 14.026) und
            // keine davon sagte, welche der Nenner ist.
            if (window.DsNav && fieldConv && fieldConv.totalBrought > 0) {
                window.DsNav.setSpaceFacts({
                    sample: deDS
                        ? `${fmtNumDS(fieldConv.totalBrought)} gewichtete Antritte · ${totalEntries.toLocaleString('de-DE')} Decks`
                        : `${fmtNumDS(fieldConv.totalBrought)} weighted entries · ${totalEntries.toLocaleString('en-US')} decks`
                }, 'gl');
            }

            let html = heroHtml + dataSourceHtml + filterHtml + overallTop8Html + moversHtml + '<div style="margin-bottom: 30px;">';

            // Render each tier
            ['tier-1', 'tier-2', 'tier-3', 'tier-trending'].forEach(tierKey => {
                const decks = tierGroups[tierKey];
                if (decks.length === 0) return;
                const tierMeta = tierTitles[tierKey];
                const isTrending = tierKey === 'tier-trending';

                // Tier 1 bis 3 bekommen die volle Archetyp-Karte, eine je
                // Zeile: das sind die Decks, die man wirklich gegeneinander
                // abwaegt, und die Zahlen gehoeren neben die Rangliste statt
                // hinter einen Klick.
                //
                // Tier 3 stand bis zum 19.08.2026 nicht dabei. Die Begruendung
                // im alten Kommentar war "45 volle Karten mit offenen
                // Matchup-Tabellen waeren rund 25 000 px" — die galt fuer Tier 3
                // UND Trending zusammen und fuer offene Tabellen. Beides trifft
                // nicht mehr zu: die Karte klappt ihre Matchups zu.
                //
                // GEMESSEN am 19.08.2026, 1440 px:
                //     eine Karte                220 px
                //     Tier 3, 9 Decks           als Kacheln:   590 px
                //                               als Karten:  2.161 px
                //     Abschnitt "Tier-Liste"    4.631 px -> 6.202 px
                //
                // Das kostet niemanden etwas, der es nicht sehen will: der
                // ganze Abschnitt faengt zugeklappt an.
                //
                // Trending bleibt kompakt — 20 Decks, und das sind gerade die,
                // bei denen die Zahlen am duennsten sind.
                const isStacked = (tierKey === 'tier-1' || tierKey === 'tier-2' || tierKey === 'tier-3');
                const gridCls = isStacked ? 'arc-inline-list' : 'deck-grid tier-deck-grid';

                if (isTrending) {
                    html += `
                    <div class="tier-section ${tierKey}" id="cm-${tierKey}">
                        <details>
                            <summary class="tier-trending-summary">
                                <h3 style="display:inline;">${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                                <span class="tier-trending-count">${decks.length} Decks</span>
                            </summary>
                            <div class="${gridCls}">`;
                } else {
                    html += `
                    <div class="tier-section ${tierKey}" id="cm-${tierKey}">
                        <h3>${tierMeta.title} <small>${tierMeta.subtitle}</small></h3>
                        <div class="${gridCls}">`;
                }
                
                decks.forEach(deck => {
                    const archetypeName = deck.archetype;
                    
                    const share = parseLocaleNumber(deck.share || deck.new_share, 0);
                    const oldShare = parseLocaleNumber(deck.old_share, 0);
                    const winRate = parseLocaleNumber(deck.winrate || deck.new_winrate, 0);
                    const powerScore = calculatePowerScore(share, winRate);
                    // Das Banner zeigte die ROHE Win Rate, waehrend dieselbe
                    // Datei fuer die Tier-Einordnung die geglaettete adjWR
                    // benutzt (computeTierScore, k = 50). Sichtbar wurde das im
                    // Rogue-Block: "0.0 % · 100.0 % WR · 1 Decks" — eine Kachel
                    // in Tier-1-Groesse fuer ein Deck mit drei Partien. Die
                    // Seite glaubte ihrer eigenen Rohzahl fuer die Sortierung
                    // nicht und druckte sie trotzdem gross. Jetzt steht die
                    // Zahl da, nach der auch einsortiert wird; die rohe steht
                    // im Titel, wo man sie nachschlagen kann.
                    const sc = deck._tierScore;
                    const zeigWR = (sc && isFinite(sc.adjWR)) ? sc.adjWR : winRate;
                    const listenN = parseInt(deck.new_count || 0) || 0;
                    // Und ab wann eine Zahl hier als duenn markiert wird.
                    // Die Glaettung zieht kleine Stichproben schon Richtung
                    // 50 %, aber sie sagt es nicht: "51,3 % WR · 10 Listen"
                    // sieht aus wie "51,1 % WR · 187 Listen". Dieselbe
                    // Groessenordnung wie die Untergrenze der Konversions-
                    // tabelle (CONV_MIN_N = 20), damit die Seite ueberall
                    // dieselbe Grenze zieht.
                    const ROGUE_MIN_LISTEN = (typeof CONV_MIN_N === 'number') ? CONV_MIN_N : 20;
                    // Und dazu, welche der drei Konventionen das ist. Die
                    // Ladder-Datei rechnet S/(S+N+U); die Matchup-Tabelle im
                    // Archetyp-Kaertchen daneben rechnet S/(S+N). Zwei
                    // richtige Zahlen, die ohne diesen Zusatz aussehen wie
                    // ein Widerspruch.
                    const wrKonv = window.WinRateKonvention
                        ? ' · ' + window.WinRateKonvention.kurzHinweis('mitUnentschieden') : '';
                    const wrTitel = (sc && isFinite(sc.adjWR)) ? escapeHtml((getLang() === 'de'
                        ? `geglättet (k = 50) — roh ${winRate.toFixed(1)} % aus ${listenN} Listen`
                        : `smoothed (k = 50) — raw ${winRate.toFixed(1)} % from ${listenN} lists`)
                        + wrKonv) : '';
                    
                    // Get archetype image
                    const archetypeCards = fuzzyArchetypeLookup(archetypeName, cardDataByArchetype);
                    const imageUrl = getArchetypeImage(archetypeName, archetypeCards);
                    
                    // Trend indicator
                    const shareChange = share - oldShare;
                    let trendHtml = getDeckTrendBadge(archetypeName, shareChange);
                    
                    const countChange = parseInt(deck.count_change || 0);
                    if (!trendHtml) {
                        if (countChange > 0) {
                            trendHtml = `<span class="stat-badge stat-trend-up">+${countChange}</span>`;
                        } else if (countChange < 0) {
                            trendHtml = `<span class="stat-badge stat-trend-down">${countChange}</span>`;
                        }
                    }
                    
                    const archetypeEscaped = escapeJsStr(archetypeName);
                    
                    // Inline trend chip — ▲ +0.3% vs prev / ▼ -0.7% / → flat.
                    // Previous value explicit so users immediately see the
                    // delta without mental math (TrainerHill pattern).
                    // F-20 from visual sweep: tooltip now spells out the
                    // 7-day window so '-0.1 %' isn't read as 'since
                    // yesterday' or 'since last quarter'.
                    //
                    // Der Chip trug einen englischen Titel und einen Punkt als
                    // Dezimaltrenner auf einer deutschen Seite. Beides folgt
                    // jetzt derselben Formatierung wie die Zahlen daneben.
                    let inlineTrend = '';
                    if (oldShare > 0) {
                        const vorher = fmtPct(oldShare);
                        const chipTitel = escapeHtml(t('tier.rogueTrendTip').replace('{vorher}', vorher));
                        if (Math.abs(shareChange) >= 0.05) {
                            const arrow = shareChange > 0 ? '▲' : '▼';
                            const cls   = shareChange > 0 ? 'tier-trend-up' : 'tier-trend-down';
                            inlineTrend = `<span class="tier-trend-chip ${cls}" title="${chipTitel}">${arrow}&nbsp;${vorher}</span>`;
                        } else {
                            inlineTrend = `<span class="tier-trend-chip tier-trend-flat" title="${chipTitel}">→&nbsp;${vorher}</span>`;
                        }
                    }

                    // When labs CSV is loaded for this meta, surface the
                    // tournament WR + #tournaments so users can see *why*
                    // the tier ranking weighs this deck high/low — pure
                    // share would never explain a strong-WR deck climbing
                    // past a higher-share one.
                    let labsBadge = '';
                    const _sc = deck._tierScore;
                    if (_sc && _sc.labsHit && labsByName) {
                        const ent = labsByName[archetypeName];
                        if (ent) {
                            // Formel ins Tooltip. Eine Win Rate ohne ihre
                            // Konvention ist auf dieser Seite nicht eindeutig:
                            // die Rohdaten tragen drei verschiedene, und der
                            // Unterschied betraegt bis zu 6,4 pp auf identischer
                            // Bilanz. Trainer Hill macht das vor und schreibt die
                            // Formel neben die Zahl.
                            const _labsTitle = (getLang() === 'de'
                                ? `Turnierdaten aus Limitless Labs · ${ent.tournaments} Turniere, ${ent.games} Partien · Win Rate = W/(W+L+U) · Matchpunkte ${fmtPct(ent.matchPointPct)}`
                                : `Limitless Labs tournament data · ${ent.tournaments} tournaments, ${ent.games} games · win rate = W/(W+L+T) · match points ${fmtPct(ent.matchPointPct)}`);
                            labsBadge = `<span class="stat-badge stat-labs" title="${escapeHtml(_labsTitle)}">🏆 ${fmtPct(ent.winPct)} WR · ${ent.tournaments}T</span>`;
                        }
                    }

                    if (isStacked) {
                        // Placeholder only — the card data (matchups, top-cut
                        // conversion) loads on its own schedule and must not
                        // hold up the tier ranking.
                        html += `<div class="arc-inline" data-deck="${escapeHtml(archetypeName)}"></div>`;
                        return;
                    }

                    html += `
                        <div class="deck-banner-card" data-deck-name="${escapeJsStr(archetypeName).toLowerCase()}" onclick="openArchetypeCard('${archetypeEscaped}')">
                            ${imageUrl ? `<div class="deck-banner-bg" style="background-image: url('${imageUrl}')"></div>` : ''}
                            <div class="deck-banner-content">
                                <div class="deck-banner-name">${archetypeName}</div>
                                <div class="deck-banner-stats">
                                    <span class="stat-badge"${wrTitel ? ` title="${wrTitel}"` : ''}>${fmtPct(share)} · ${fmtPct(zeigWR)} WR</span>
                                    ${listenN > 0
                                      ? `<span class="stat-badge stat-sample-size${listenN < ROGUE_MIN_LISTEN ? ' tier-listen-duenn' : ''}" title="${escapeHtml(listenN < ROGUE_MIN_LISTEN ? t('tier.rogueThinTip').replace('{n}', String(ROGUE_MIN_LISTEN)) : t('tier.rogueSampleTip'))}">${
                                          getLang() === 'de'
                                            ? `${listenN.toLocaleString('de-DE')} ${listenN === 1 ? 'Liste' : 'Listen'}`
                                            : `${listenN.toLocaleString('en-US')} ${listenN === 1 ? 'list' : 'lists'}`
                                        }${listenN < ROGUE_MIN_LISTEN ? ` · ${escapeHtml(t('tier.clThinSample'))}` : ''}</span>`
                                      : ''}
                                    ${labsBadge}
                                    ${inlineTrend}
                                    ${trendHtml}
                                </div>
                            </div>
                        </div>`;
                });
                
                if (isTrending) {
                    html += `
                            </div>
                        </details>
                    </div>`;
                } else {
                    html += `
                        </div>
                    </div>`;
                }
            });
            
            html += '</div>';
            
            // Prepend hero + tier sections before existing content
            container.innerHTML = html + container.innerHTML;

            // Fill the stacked archetype cards. Deliberately after the
            // innerHTML assignment and deliberately not awaited: the tier
            // ranking is already on screen, and the cards arrive when their
            // own data does.
            if (typeof window.renderInlineArchetypeCards === 'function') {
                window.renderInlineArchetypeCards(container);
            }
        }
        
        /**
         * Calculate global card statistics across all decks
         * Counts how often each card appears in the meta (ignoring basic energies)
         */
        function calculateGlobalCardStats(cardDataArray) {
            // Basic energies to exclude
            const basicEnergies = new Set([
                'grass energy', 'fire energy', 'water energy', 'lightning energy', 
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy', 
                'fairy energy', 'dragon energy', 'basic grass energy', 'basic fire energy',
                'basic water energy', 'basic lightning energy', 'basic psychic energy',
                'basic fighting energy', 'basic darkness energy', 'basic metal energy'
            ]);
            
            if (!cardDataArray || cardDataArray.length === 0) return [];
            
            // Get unique archetypes to count total decks
            const uniqueArchetypes = new Set(cardDataArray.map(c => c.archetype).filter(Boolean));
            const totalDecks = uniqueArchetypes.size;
            const safeTotalDecks = Math.max(1, Math.floor(totalDecks));
            
            // Aggregate cards globally
            const globalCardStats = {};
            
            cardDataArray.forEach(card => {
                const cardName = card.card_name;
                const normalizedName = cardName.toLowerCase().trim();
                
                // Skip basic energies
                if (basicEnergies.has(normalizedName)) return;
                
                // Initialize card entry if doesn't exist
                if (!globalCardStats[cardName]) {
                    globalCardStats[cardName] = {
                        name: cardName,
                        archetypes: new Set(),
                        total_appearances: 0,
                        image_url: card.image_url || '',
                        type: card.type || '',
                        rarity: card.rarity || '',
                        set_code: card.set_code || '',
                        set_number: card.set_number || ''
                    };
                }
                
                // Add archetype to set (for unique deck count)
                globalCardStats[cardName].archetypes.add(card.archetype);
                globalCardStats[cardName].total_appearances++;
            });
            
            // Calculate global share and convert to array
            const result = Object.values(globalCardStats).map(card => {
                const deckInclusionCount = card.archetypes.size;
                const rawShare = (deckInclusionCount / safeTotalDecks) * 100;
                const globalShare = Math.min(100, Math.max(0, rawShare));
                if (rawShare > 100.01) {
                    console.warn('[TopCards] Global share capped above 100%', {
                        card: card.name,
                        rawShare,
                        cappedShare: globalShare,
                        deckInclusionCount,
                        safeTotalDecks
                    });
                }
                
                return {
                    name: card.name,
                    deck_inclusion_count: deckInclusionCount,
                    global_share: parseFloat(globalShare.toFixed(1)),
                    total_appearances: card.total_appearances,
                    image_url: card.image_url,
                    type: card.type,
                    rarity: card.rarity,
                    set_code: card.set_code,
                    set_number: card.set_number
                };
            });
            
            // Sort by global share (descending)
            result.sort((a, b) => b.global_share - a.global_share);
            
            return result;
        }
        
        /**
         * Render Top Cards Widget (Format Staples)
         * Shows the most used cards across all decks in the current meta
         */
        function renderTopCardsWidget(topCards) {
            if (!topCards || topCards.length === 0) return '';
            
            const top15 = topCards.slice(0, 15);
            const deLbl = getLang() === 'de';
            
            let html = `
                <div class="top-cards-container">
                    <h3 style="color: #2c3e50; margin: 0 0 15px 0; font-size: 1.3em; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                        ${t('tier.mostUsedCards')}
                    </h3>
                    <div class="top-cards-grid">`;
            
            top15.forEach((card, index) => {
                const rank = index + 1;
                const imageUrl = card.image_url || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="280"%3E%3Crect fill="%23ddd" width="200" height="280"/%3E%3C/svg%3E';
                
                // Determine rank badge color
                let rankColor = '#95a5a6'; // Default gray
                if (rank === 1) rankColor = '#f39c12'; // Gold
                else if (rank === 2) rankColor = '#95a5a6'; // Silver
                else if (rank === 3) rankColor = '#cd7f32'; // Bronze
                else if (rank <= 5) rankColor = '#3498db'; // Blue for top 5
                
                // ♡ und ★ sind die Symbole, die diese Seite schon benutzt:
                // &#9825; fuer "auf die Wunschliste" (js/app-cards-db.js:2867)
                // und ★ fuer den Artwork-/Rarity-Wechsel (app-city-league.js,
                // app-deck-builder.js, app-current-meta-analysis.js). Hier stand
                // zuerst ein ▧ — gemeldet: "es waer schon gut, wenn wir ueberall
                // immer das gleiche Logo nutzen".
                //
                // Zwei Knoepfe je Karte, gemeldet am 19.08.2026: "hier muesste
                // man vielleicht nur noch die Moeglichkeit haben, die direkt
                // auf die Wunschliste zu packen, und dass man die Chance hat,
                // sich alle verschiedenen Artworks anzeigen zu lassen".
                //
                // Beides gibt es laengst — addToWishlist() in
                // js/firebase-collection.js und openRaritySwitcherFromDB() in
                // js/app-cards-db.js. Nur hier waren sie nie verdrahtet. Die
                // Kartendaten tragen set_code und set_number ohnehin mit.
                //
                // Ohne Set und Nummer laesst sich weder eine Wunschliste
                // fuehren noch ein Artwork nachschlagen — dann bleibt die
                // Karte eben ohne Knoepfe, statt zwei tote anzubieten.
                const hatDruck = !!(card.set_code && card.set_number);
                const kartenId = hatDruck ? `${card.name}|${card.set_code}|${card.set_number}` : '';
                const aktionen = hatDruck ? `
                        <div class="top-card-actions">
                            <button type="button" class="top-card-act"
                                    onclick="addToWishlist('${escapeJsStr(kartenId)}')"
                                    title="${escapeHtml(deLbl ? 'Auf die Wunschliste' : 'Add to wishlist')}"
                                    aria-label="${escapeHtml((deLbl ? 'Auf die Wunschliste: ' : 'Add to wishlist: ') + card.name)}">♡</button>
                            <button type="button" class="top-card-act"
                                    onclick="openRaritySwitcherFromDB('${escapeJsStr(card.name)}', '${escapeJsStr(card.set_code)}', '${escapeJsStr(String(card.set_number))}')"
                                    title="${escapeHtml(deLbl ? 'Andere Artworks dieser Karte' : 'Other artworks of this card')}"
                                    aria-label="${escapeHtml((deLbl ? 'Artworks: ' : 'Artworks: ') + card.name)}">★</button>
                        </div>` : '';

                html += `
                    <div class="top-card-item">
                        <div style="position:relative;">
                            <img src="${imageUrl}" class="top-card-img" alt="${escapeHtml(card.name)}" loading="lazy" data-image-source="limitless-en">
                            <div class="top-card-rank" style="background: ${rankColor};">#${rank}</div>
                        </div>
                        <div class="top-card-stats">
                            <div class="top-card-name">${escapeHtml(card.name)}</div>
                            <div class="top-card-share">${fmtPct(card.global_share)} ${escapeHtml(deLbl ? 'der Decks' : 'of decks')}</div>
                            <div class="top-card-decks">${card.deck_inclusion_count} ${escapeHtml(deLbl ? 'Decks' : 'decks')}</div>
                        </div>
                        ${aktionen}
                    </div>`;
            });
            
            html += `
                    </div>
                </div>`;
            
            return html;
        }
        
        /**
         * Render and inject Top Cards Widget into Current Meta tab
         */
        async function renderCurrentMetaTopCards() {
            const container = document.querySelector('#currentMetaContent .container') || document.getElementById('currentMetaContent');
            if (!container) return;
            
            // Load card data
            let cardData = [];
            
            try {
                cardData = await loadCurrentMetaRowsWithFallback({ forceRefresh: true });
            } catch (e) {
                console.warn('Could not load card data for top cards widget:', e);
                return;
            }
            
            if (cardData.length === 0) return;
            
            // Calculate global card stats
            const globalStats = calculateGlobalCardStats(cardData);
            
            // Render widget HTML
            const widgetHtml = renderTopCardsWidget(globalStats);
            
            // Find existing widget or prepend new one
            let existingWidget = container.querySelector('.top-cards-container');
            if (existingWidget) {
                existingWidget.outerHTML = widgetHtml;
            } else {
                // Insert after tier list but before stat cards
                const firstStatCard = container.querySelector('.stat-card');
                if (firstStatCard && firstStatCard.parentElement) {
                    firstStatCard.parentElement.insertAdjacentHTML('beforebegin', widgetHtml);
                } else {
                    container.insertAdjacentHTML('afterbegin', widgetHtml);
                }
            }
        }
        
// ============================================================================
// Live deck-name filter for the Current Meta tier list.
// Hides .deck-banner-card whose data-deck-name doesn't include the term
// (whitespace-insensitive). Tier section + hero card all flow through the
// same selector so one input filters everything visible above.
//
// Empty section headers stay rendered — keeps the visual hierarchy intact;
// users immediately see "your filter has no Tier 1 hits" rather than the
// section disappearing under their cursor.
// ============================================================================
window.filterTierDeckCards = function (term) {
    const t = String(term || '').toLowerCase().trim().replace(/\s+/g, '');
    const cards = document.querySelectorAll('.deck-banner-card[data-deck-name]');
    cards.forEach(card => {
        const name = (card.getAttribute('data-deck-name') || '').replace(/\s+/g, '');
        const match = !t || name.includes(t);
        card.style.display = match ? '' : 'none';
    });
};
