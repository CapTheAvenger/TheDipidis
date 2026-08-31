// Side Quest — "Play this team" panel.
//
// User-flagged 2026-06-14: during the 90-second team-selection phase
// of a Pokémon Champions match you only get a few seconds to decide
// which 4 of your 6 to bring. The decisive info is:
//   (a) Who's faster than what?         — Speed stats per pokémon
//   (b) Which type matchups hurt me?    — defensive type chart
//   (c) What's the opponent running?    — quick tap-from-grid picker
//                                         (typing names is too slow)
//
// This module renders a full-screen overlay opened from the Play
// button on every Side-Quest team card. Two columns: your team
// (left, EVs/nature pre-filled) and opponent (right, six empty
// slots until tapped via the sprite picker).
//
// Camera-based sprite recognition was discussed but deferred: a
// 1000-class CV model in-browser would need either TF.js + 150 MB
// or a curated pHash DB, neither solid against game-screen glare.
// The fast-filter sprite picker covers ~95 % of the use case.

(function () {
    'use strict';

    const DATA_URL = 'data/pokemon_battle_data.json';
    // Wider per-mon EV/nature corpus pulled from the full VGCPastes
    // sheet within a 14-day window (~80-100 teams vs the top-20 we
    // render for the UI). Used to compute the typical opponent Speed
    // — user-flagged 2026-06-15: top-20 sample was too narrow per
    // species to read as "what does the opponent actually play".
    const SPEED_CORPUS_URL = 'data/champions_speed_corpus.json';
    // German species names so search "Knakrack" / "Vulnona" / "Eis"
    // finds the right Showdown entry. User-flagged 2026-06-15: typing
    // names a German speaker doesn't know in English is friction.
    const NAMES_DE_URL = 'data/pokemon_names_de.json';
    let _pokedex = null;
    let _pokedexLoading = null;
    let _speedCorpus = null;
    let _speedCorpusLoading = null;
    let _namesDe = null;          // { englishName: germanName, ... }
    let _namesDeLoading = null;
    let _baseNameCache = new Map(); // lowercase-showdown-name → base-EN cache

    // Lazy-load — 150 KB is meaningful on mobile data. Only paid when
    // the user actually opens the Play panel for the first time.
    function loadPokedex() {
        if (_pokedex) return Promise.resolve(_pokedex);
        if (_pokedexLoading) return _pokedexLoading;
        _pokedexLoading = fetch(`${DATA_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(json => { _pokedex = json || {}; rebuildTypicalSpeeds(); return _pokedex; })
            .catch(() => { _pokedex = {}; return _pokedex; });
        return _pokedexLoading;
    }

    // Optional load — the corpus file may not exist on a fresh deploy
    // (older scraper run, missing weekly job, etc.). When absent the
    // typical-Speed estimator falls back to the top-20 teams just like
    // before. Same fallback for the picker pool: corpus species/counts
    // are far richer than top-20 (~500 samples / ~40-60 species vs
    // ~120 samples / ~40 species).
    function loadSpeedCorpus() {
        if (_speedCorpus !== null) return Promise.resolve(_speedCorpus);
        if (_speedCorpusLoading) return _speedCorpusLoading;
        _speedCorpusLoading = fetch(`${SPEED_CORPUS_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                _speedCorpus = (json && Array.isArray(json.samples)) ? json : { samples: [] };
                rebuildTypicalSpeeds();
                rebuildLegalPool();
                return _speedCorpus;
            })
            .catch(() => { _speedCorpus = { samples: [] }; return _speedCorpus; });
        return _speedCorpusLoading;
    }

    function loadNamesDe() {
        if (_namesDe) return Promise.resolve(_namesDe);
        if (_namesDeLoading) return _namesDeLoading;
        _namesDeLoading = fetch(`${NAMES_DE_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : {})
            .then(json => { _namesDe = json || {}; return _namesDe; })
            .catch(() => { _namesDe = {}; return _namesDe; });
        return _namesDeLoading;
    }

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            playBtn:        'Play',
            playAria:       'Live-Hilfe für Team',
            close:          'Schließen',
            yourTeam:       'Dein Team',
            opponentTeam:   'Gegnerisches Team',
            opponentHint:   'Tippe „Alle 6 schnell auswählen" und klick dann die gegnerischen Pokémon der Reihe nach — die Auswahl bleibt offen, bis das Team voll ist.',
            speed:          'Speed',
            base:           'Basis',
            max:            'Max',
            actual:         'Aktuell',
            tailwind:       'Rückenwind',
            weaknesses:     'Schwach gegen',
            noWeak:         'Keine Schwächen.',
            tap:            'Tippen',
            empty:          'leer',
            searchPh:       '🔎 Pokémon, deutsche Namen oder Typ („Knakrack" · „Eis")…',
            pickerClose:    'Auswahl schließen',
            clearOpp:       'Slot leeren',
            unknownSpecies: 'Spezies nicht in Stats-DB',
            poolLegal:      'Nur Format-Pool ({count})',
            poolAll:        'Alle Pokémon ({count})',
            usedNxTimes:    (n) => `${n}× im Top-Team-Pool gespielt`,
            quickPick:      '✱ Alle 6 schnell auswählen',
            quickPickAria:  'Alle gegnerischen Pokémon nacheinander auswählen',
            fillProgress:   (a, b) => `Pick ${a} / ${b}`,
            clearAll:       'Alle leeren',
            speedLadder:    'Speed-Ladder',
            speedLadderHint:'Wer schneller ist, geht zuerst — beide Teams nach effektiver Geschwindigkeit sortiert.',
            sideYours:      'Du',
            sideOpp:        'Gegner',
            typicalTag:     '~',
            typicalTitle:   (ev, nat, n) => `Typischer Spread (am häufigsten im Top-Pool gespielt): ${ev} Spe ${nat} (n=${n}) — „~" steht für „ungefähr", nicht für Typ.`,
            fallbackBase:   (n) => `Spezies erst ${n}× im Pool — Basis-Speed als Fallback`,
            tailwindLabel:  'TW',
            rangeTitle:     'Basis–Max bei Level 50 (kein EV/+Nature → voll-EV/+Nature)',
            megaShort:      'M',
            megaTitle:      (base, mega) => `Mega-Initiative bei Level 50: ${mega} (aktuell, vor Mega ${base}). Mega-Stein im Item — bei Mega-Entwicklung ändern sich die Stats.`,
            megaRangeTitle: (min, max) => `Mega-Initiative-Range bei Level 50: ${min}–${max} (kein EV/+Nature → voll-EV/+Nature, nach Mega-Entwicklung).`,
        },
        en: {
            playBtn:        'Play',
            playAria:       'Live helper for team',
            close:          'Close',
            yourTeam:       'Your team',
            opponentTeam:   'Opponent team',
            opponentHint:   'Tap "Quick-pick all 6" once and rattle through the opponent\'s mons — the picker stays open until the team is full.',
            speed:          'Speed',
            base:           'Base',
            max:            'Max',
            actual:         'Actual',
            tailwind:       'Tailwind',
            weaknesses:     'Weak to',
            noWeak:         'No weaknesses.',
            tap:            'Tap',
            empty:          'empty',
            searchPh:       '🔎 Pokémon, German names or type ("Knakrack" · "Eis")…',
            pickerClose:    'Close picker',
            clearOpp:       'Clear slot',
            unknownSpecies: 'Species not in stats DB',
            poolLegal:      'Format pool only ({count})',
            poolAll:        'All pokémon ({count})',
            usedNxTimes:    (n) => `Used ${n}× in top-team pool`,
            quickPick:      '✱ Quick-pick all 6',
            quickPickAria:  'Pick all six opponent pokémon in sequence',
            fillProgress:   (a, b) => `Pick ${a} / ${b}`,
            clearAll:       'Clear all',
            speedLadder:    'Speed ladder',
            speedLadderHint:'Whoever\'s faster moves first — both teams ranked by effective Speed.',
            sideYours:      'You',
            sideOpp:        'Opp',
            typicalTag:     '~',
            typicalTitle:   (ev, nat, n) => `Typical spread (most-played in top-pool): ${ev} Spe ${nat} (n=${n}) — "~" means "approximately", not "type".`,
            fallbackBase:   (n) => `Species only appears ${n}× — base Speed shown as fallback`,
            tailwindLabel:  'TW',
            rangeTitle:     'Base–Max at Level 50 (zero EV / neutral nature → max EV / +nature)',
            megaShort:      'M',
            megaTitle:      (base, mega) => `Mega Speed at Level 50: ${mega} (current, pre-Mega ${base}). Mega Stone held — stats change on Mega Evolution.`,
            megaRangeTitle: (min, max) => `Mega Speed range at Level 50: ${min}–${max} (zero EV / neutral nature → max EV / +nature, after Mega Evolution).`,
        },
    };

    function t() { return LABELS[uiLang()]; }

    // ── Format pool (legal species + usage frequency) ───────────────
    // User-flagged 2026-06-14: the full 1480-entry Showdown pokedex is
    // far too noisy for a "tap the opponent's mon in 2 seconds"
    // workflow. The actually-relevant pool is the species that show
    // up in the current Pokémon Champions top-team data, sorted by
    // how often they appear (more played = quicker to spot).
    //
    // legalPool + usageCount are derived from
    // data/champions_replica_teams.json via window.sideQuest.loadData.
    // Falls back to "show all" if the side-quest data isn't reachable.
    let _legalPool = null;       // Set<string>   — species playing in top teams
    let _usageCount = null;      // Map<string, number>
    let _showAllInPicker = false;
    let _poolLoading = null;

    function aggregateLegalPool(teams) {
        const pool = new Set();
        const counts = new Map();
        for (const t of (teams || [])) {
            for (const p of (t.pokemon || [])) {
                const name = p && p.name;
                if (!name) continue;
                pool.add(name);
                counts.set(name, (counts.get(name) || 0) + 1);
            }
        }
        return { pool, counts };
    }

    // Mirror of aggregateLegalPool but for the flat samples shape the
    // 14-day Speed corpus carries. Same output contract so the picker
    // doesn't care which source built the pool.
    function aggregateLegalPoolFromSamples(samples) {
        const pool = new Set();
        const counts = new Map();
        for (const s of (samples || [])) {
            const name = s && s.species;
            if (!name) continue;
            pool.add(name);
            counts.set(name, (counts.get(name) || 0) + 1);
        }
        return { pool, counts };
    }

    // Rebuilds _legalPool / _usageCount after either data source
    // loads. Corpus wins when it carries non-zero samples — that's
    // the broader window the user explicitly wants ("nicht nur Top
    // zwanzig"). Falls back to top-20 teams when the corpus file is
    // missing or empty (older deploys).
    function rebuildLegalPool() {
        if (_speedCorpus && Array.isArray(_speedCorpus.samples) && _speedCorpus.samples.length > 0) {
            const { pool, counts } = aggregateLegalPoolFromSamples(_speedCorpus.samples);
            _legalPool = pool;
            _usageCount = counts;
            return;
        }
        if (_teamsCache) {
            const { pool, counts } = aggregateLegalPool(_teamsCache);
            _legalPool = pool;
            _usageCount = counts;
        }
    }

    // German type names — searching "Eis" / "Drache" / "Feuer" should
    // pull every Pokémon of that type, even if the user doesn't know
    // the English type word. Keys must match TYPE_CHART exactly so
    // the lookup via pokedex entry.types[] hits.
    const TYPE_NAMES_DE = {
        Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro',
        Grass: 'Pflanze', Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift',
        Ground: 'Boden', Flying: 'Flug', Psychic: 'Psycho', Bug: 'Käfer',
        Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache', Dark: 'Unlicht',
        Steel: 'Stahl', Fairy: 'Fee',
    };

    // Strip the Showdown form suffix ("Garchomp-Mega" → "Garchomp",
    // "Ninetales-Alola" → "Ninetales") so the German-name lookup hits
    // the base species — DE translations only cover base mons. Cached
    // because the picker iterates the full pool on every keystroke.
    function baseEnglish(name) {
        const k = String(name || '');
        const cached = _baseNameCache.get(k);
        if (cached) return cached;
        const base = k.split('-')[0];
        _baseNameCache.set(k, base);
        return base;
    }

    // Does `name` (a Showdown species key) match `filter` under the
    // expanded rule set? Used by the picker grid on every keystroke.
    //   - English Showdown name substring (current behaviour)
    //   - German base-species name substring
    //   - Either-language type name — typing "Eis" / "Ice" surfaces
    //     all Ice-type Pokémon
    // All comparisons are lowercased; filter is pre-normalised by the
    // caller for speed (one toLowerCase per keystroke, not per cell).
    //
    // dex/namesDe sind optional und ueberschreiben den Modulzustand.
    // Die Aufrufer im Panel lassen sie weg; der Unit-Test reicht sie
    // durch, damit er diese Funktion pruefen kann statt einer Kopie.
    function speciesMatchesFilter(name, lcFilter, dex, namesDe) {
        if (!lcFilter) return true;
        if (name.toLowerCase().includes(lcFilter)) return true;
        const base = baseEnglish(name);
        const namesDeSrc = namesDe || _namesDe;
        if (namesDeSrc) {
            const de = namesDeSrc[base];
            if (de && de.toLowerCase().includes(lcFilter)) return true;
        }
        // Type rule: prefix match, NOT substring. "eis" must hit "Eis"
        // (Ice) but not "Geist" (Ghost). Without the prefix rule,
        // every Ghost-type Pokémon surfaced when the user typed "eis"
        // — exactly the wrong direction.
        const dexSrc = dex || _pokedex;
        const spec = dexSrc && dexSrc[name];
        if (spec && Array.isArray(spec.types)) {
            for (const ty of spec.types) {
                if (ty.toLowerCase().startsWith(lcFilter)) return true;
                const tyDe = TYPE_NAMES_DE[ty];
                if (tyDe && tyDe.toLowerCase().startsWith(lcFilter)) return true;
            }
        }
        return false;
    }

    let _typicalSpeeds = null;   // { [name]: {typicalSpeed, evMode, natureMode, sampleSize} }
    let _teamsCache = null;      // raw teams list, kept for typical-speed rebuild after pokedex loads

    function loadLegalPool() {
        if (_legalPool) return Promise.resolve();
        if (_poolLoading) return _poolLoading;
        _poolLoading = (async () => {
            try {
                if (window.sideQuest && typeof window.sideQuest.loadData === 'function') {
                    const data = await window.sideQuest.loadData();
                    const teams = (data && data.teams) || [];
                    _teamsCache = teams;
                    const { pool, counts } = aggregateLegalPool(teams);
                    _legalPool = pool;
                    _usageCount = counts;
                    rebuildTypicalSpeeds();
                    return;
                }
            } catch (_e) { /* fall through to empty */ }
            _legalPool = new Set();
            _usageCount = new Map();
        })();
        return _poolLoading;
    }

    function rebuildTypicalSpeeds() {
        if (!_pokedex) return;
        // Prefer the wider Speed corpus (14-day window across the full
        // sheet) when loaded. Fall back to the top-20 team list — keeps
        // the panel functional on deploys before the corpus file lands.
        if (_speedCorpus && Array.isArray(_speedCorpus.samples) && _speedCorpus.samples.length > 0) {
            _typicalSpeeds = buildTypicalSpeedsFromSamples(
                _speedCorpus.samples,
                (n) => lookupSpecies(n),
            );
            return;
        }
        if (_teamsCache) {
            _typicalSpeeds = buildTypicalSpeeds(_teamsCache, (n) => lookupSpecies(n));
        }
    }

    // For each species appearing in the top-team data, derive the
    // most-played Speed spread (Spe EVs + nature → resulting actual
    // L50 Speed). Used by the Speed Ladder and the opponent slot
    // card so the user sees "what does Garchomp actually run", not
    // just "Garchomp base–max range 122-169".
    //
    // Mode rule: most-frequent (ev, nature) combo wins. Ties broken
    // by highest resulting Speed (speed-creep tends to win meta-
    // rep races, so the higher value is the safer assumption when
    // two spreads tie in popularity).
    function buildTypicalSpeeds(teams, lookupSpec) {
        // Wrap team records into the shared sample shape so the mode
        // math has one implementation. Callers with the new corpus
        // file should use buildTypicalSpeedsFromSamples directly.
        const samples = [];
        for (const t of (teams || [])) {
            for (const p of (t.pokemon || [])) {
                if (!p || !p.name) continue;
                samples.push({ species: p.name, evs: p.evs || '', nature: p.nature || '' });
            }
        }
        return buildTypicalSpeedsFromSamples(samples, lookupSpec);
    }

    function buildTypicalSpeedsFromSamples(samples, lookupSpec) {
        const grouped = new Map();
        for (const s of (samples || [])) {
            const name = s && s.species;
            if (!name) continue;
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push({
                ev: parseEVs(s.evs).spe,
                nature: s.nature || '',
            });
        }
        const out = {};
        for (const [name, instances] of grouped) {
            const spec = lookupSpec(name);
            if (!spec || !spec.baseStats) continue;
            const baseSpe = spec.baseStats.spe;
            const counts = new Map();
            for (const inst of instances) {
                const key = inst.ev + '|' + inst.nature;
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            let bestKey = null, bestCount = 0, bestSpeed = -1;
            for (const [k, v] of counts) {
                const [evStr, nat] = k.split('|');
                const spd = actualSpeedAt50(baseSpe, parseInt(evStr, 10), natureSpeedMod(nat));
                if (v > bestCount || (v === bestCount && spd > bestSpeed)) {
                    bestCount = v; bestKey = k; bestSpeed = spd;
                }
            }
            if (!bestKey) continue;
            const [evStr, nature] = bestKey.split('|');
            out[name] = {
                typicalSpeed: bestSpeed,
                evMode: parseInt(evStr, 10),
                natureMode: nature,
                sampleSize: instances.length,
                modeShare: bestCount / instances.length,
            };
        }
        return out;
    }

    // Returns the picker source list, sorted by usage DESC then name.
    // When the legal pool is empty (load failure) or the user toggled
    // "Alle anzeigen", the full pokedex is used as the source. Always
    // restricted to species we actually have stats for — a picker hit
    // on something the pokedex doesn't know would render as "?".
    function pickerSortedNames() {
        const allDex = Object.keys(_pokedex || {});
        const usingFull = _showAllInPicker || !_legalPool || _legalPool.size === 0;
        const pool = usingFull
            ? allDex
            : allDex.filter(n => _legalPool.has(n));
        pool.sort((a, b) => {
            const ua = (_usageCount && _usageCount.get(a)) || 0;
            const ub = (_usageCount && _usageCount.get(b)) || 0;
            if (ua !== ub) return ub - ua;        // usage DESC
            return a.localeCompare(b);            // alpha fallback
        });
        return { names: pool, usingFull, dexSize: allDex.length };
    }

    // ── Type effectiveness (defensive) ──────────────────────────────
    // Map from attacking_type → defending_type → multiplier.
    // Standard Gen 6+ chart (Fairy added). The Play panel only
    // surfaces weaknesses (×2, ×4); resistances/immunities are a
    // separate code-path the user explicitly said they don't need
    // ("gegen was ich stark bin ist nur halb wichtig").
    //
    // MASSGEBLICH IST data/champions_type_chart.json — dieselbe
    // Tabelle, die Rechner und Matchup-Ansicht laden. Hier steht sie
    // fest im Code, weil dieses Panel am Turniertisch in 90 Sekunden
    // gebraucht wird: eine fehlgeschlagene Anfrage darf keine leere
    // Schwächenliste ergeben. Damit aus "zwei Orte" kein "zwei
    // Wahrheiten" wird, vergleicht tests/unit/test-side-quest-play.js
    // alle 18x18 Felder gegen die JSON-Datei und gegen eine unabhängig
    // getippte Verteidigungstabelle.
    //
    // Gefunden am 2026-08-18, drei Felder wichen ab, alle drei hier
    // falsch: Geist→Unlicht stand auf 2 statt 0.5 (Unlicht ist gegen
    // Geist resistent, seit Gen 2), und die Feen-Zeile hatte die
    // Käfer-Zeile abgeschrieben: Fee→Käfer 0.5 statt 1, Fee→Feuer
    // fehlte ganz statt 0.5.
    const TYPE_CHART = {
        Normal:   { Rock: 0.5, Ghost: 0,   Steel: 0.5 },
        Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
        Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
        Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
        Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
        Ice:      { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
        Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
        Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
        Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
        Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
        Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
        Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
        Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
        Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
        Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
        Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
        Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
        Fairy:    { Fighting: 2, Poison: 0.5, Fire: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
    };

    const ALL_TYPES = Object.keys(TYPE_CHART);

    // Given a defender's type list, return a list of attacker types
    // that hit it for super-effective damage, with multiplier.
    // Pure function — exposed for unit tests.
    function defensiveWeaknesses(defenderTypes) {
        if (!defenderTypes || defenderTypes.length === 0) return [];
        const results = [];
        for (const atk of ALL_TYPES) {
            let mult = 1;
            for (const def of defenderTypes) {
                const row = TYPE_CHART[atk];
                if (!row) continue;
                const v = row[def];
                if (v !== undefined) mult *= v;
            }
            if (mult > 1) results.push({ type: atk, mult });
        }
        // Order: 4× first (rare, deadly), then 2×, both alphabetical.
        results.sort((a, b) => (b.mult - a.mult) || a.type.localeCompare(b.type));
        return results;
    }

    // ── Speed-stat math (mainline Gen 9 formula at Level 50) ────────
    // Pokémon Champions uses a 32-EV-per-stat cap. Mapping that to
    // mainline's 252-EV cap (so the formula stays grounded in the
    // well-known L50 numbers like Garchomp = 169) means scaling
    // user-supplied EVs by 8 internally (32 × 8 = 256, capped at 252).
    // If a future Champions-specific Speed formula comes to light,
    // swap CHAMPIONS_EV_SCALE here.
    const LEVEL = 50;
    const MAX_IV = 31;
    const MAX_EV_MAINLINE = 252;
    const CHAMPIONS_EV_SCALE = 8;

    function speedStat(base, mainlineEV, natureMod) {
        const ev = Math.min(MAX_EV_MAINLINE, Math.max(0, mainlineEV));
        const inner = Math.floor(((2 * base + MAX_IV + Math.floor(ev / 4)) * LEVEL) / 100 + 5);
        return Math.floor(inner * natureMod);
    }

    function baseSpeedAt50(base) { return speedStat(base, 0, 1.0); }
    function maxSpeedAt50(base)  { return speedStat(base, MAX_EV_MAINLINE, 1.1); }
    function actualSpeedAt50(base, championsEV, natureMod) {
        return speedStat(base, championsEV * CHAMPIONS_EV_SCALE, natureMod);
    }

    // +Speed: Hasty, Jolly, Naive, Timid → 1.1
    // -Speed: Brave, Quiet, Relaxed, Sassy → 0.9
    // Neutral: everything else → 1.0
    const NATURE_SPEED = {
        Hasty: 1.1, Jolly: 1.1, Naive: 1.1, Timid: 1.1,
        Brave: 0.9, Quiet: 0.9, Relaxed: 0.9, Sassy: 0.9,
    };
    function natureSpeedMod(name) {
        return NATURE_SPEED[String(name || '').trim()] || 1.0;
    }

    // Parse "8 HP / 1 Def / 25 SpA / 32 Spe" → { hp:8, def:1, spa:25, spe:32 }.
    // Unknown / blank fields default to 0.
    function parseEVs(str) {
        const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        if (!str) return out;
        const key = { HP:'hp', Atk:'atk', Def:'def', SpA:'spa', SpD:'spd', Spe:'spe' };
        String(str).split('/').forEach(seg => {
            const m = String(seg).trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
            if (!m) return;
            const k = key[m[2].replace(/^./, c => c.toUpperCase()).replace(/^Sp([adAD])$/, (_, x) => 'Sp' + x.toUpperCase())]
                   || key[m[2]];
            if (k) out[k] = parseInt(m[1], 10);
        });
        return out;
    }

    // Showdown-format name lookup, with a few well-known aliases
    // because pokepaste names don't always match Pokedex.ts exactly.
    // Returns the {types, baseStats} entry or null.
    function lookupSpecies(name) {
        if (!_pokedex || !name) return null;
        if (_pokedex[name]) return _pokedex[name];
        // Common adjustments: "Charizard-Mega-Y" vs "Charizard-Mega Y", etc.
        const variants = [
            name.replace(/-Mega-Y$/, '-Mega-Y'),
            name.replace(/-/g, ''),
            name.replace(/-/g, ' '),
            name.split('-')[0],
        ];
        for (const v of variants) {
            if (_pokedex[v]) return _pokedex[v];
        }
        return null;
    }

    // Mega detection — in this format Mega Evolution replaces Tera. A
    // held Mega Stone (item name ends in "-ite", optionally " X"/" Y")
    // swaps the species for its "-Mega" form, which has DIFFERENT base
    // stats — most importantly a different Speed. Returns the mega
    // pokedex entry (with a ._megaLabel of '', 'X' or 'Y') or null when
    // the mon can't Mega Evolve. Eviolite is the one "-ite" item that
    // isn't a Mega Stone, and it's never legal on a (fully-evolved)
    // mega-capable mon anyway — excluded for safety.
    function megaLabelFromKey(key) {
        if (/-Mega-X$/i.test(key)) return 'X';
        if (/-Mega-Y$/i.test(key)) return 'Y';
        return '';
    }
    function withMegaLabel(spec, key) {
        return Object.assign({}, spec, { _megaLabel: megaLabelFromKey(key) });
    }
    function lookupMega(name, item) {
        if (!_pokedex || !name || !item) return null;
        const it = String(item).trim();
        if (!/ite( ?[XY])?$/i.test(it)) return null;   // not a Mega Stone
        if (/^eviolite$/i.test(it)) return null;
        const base = String(name).split('-')[0];
        const xy = / X$/i.test(it) ? '-X' : / Y$/i.test(it) ? '-Y' : '';
        const candidates = [];
        if (xy) candidates.push(base + '-Mega' + xy);
        candidates.push(base + '-Mega', base + '-Mega-X', base + '-Mega-Y');
        for (const c of candidates) {
            if (_pokedex[c] && _pokedex[c].baseStats) return withMegaLabel(_pokedex[c], c);
        }
        return null;
    }

    // Species-based Mega lookup — used for OPPONENT mons where we don't
    // know the held item (so we can't tell whether they'll actually
    // Mega Evolve). Returns EVERY Mega form the species has so the
    // ladder can surface the Speed POTENTIAL ("if their Froslass /
    // Dragonite Megas, here's how fast"). For X/Y dual megas (Raichu,
    // Mewtwo, Charizard) both forms are returned, each labelled.
    function listMegaSpecies(name) {
        if (!_pokedex || !name) return [];
        const base = String(name).split('-')[0];
        const out = [];
        for (const c of [base + '-Mega', base + '-Mega-X', base + '-Mega-Y']) {
            if (_pokedex[c] && _pokedex[c].baseStats) out.push(withMegaLabel(_pokedex[c], c));
        }
        return out;
    }

    // Build the per-row Mega list (each: {label, speed, min, max}) from
    // a set of Mega specs. Returned empty unless at least one form
    // actually shifts the Speed range — keeps noise off megas that don't
    // change Speed (Venusaur, Charizard). When one of an X/Y pair does
    // change, BOTH are kept so the comparison reads clearly.
    function buildMegaList(megaSpecs, baseMin, baseMax, speedFn) {
        if (!megaSpecs || !megaSpecs.length) return [];
        const anyDelta = megaSpecs.some(ms =>
            baseSpeedAt50(ms.baseStats.spe) !== baseMin ||
            maxSpeedAt50(ms.baseStats.spe) !== baseMax);
        if (!anyDelta) return [];
        return megaSpecs.map(ms => ({
            label: ms._megaLabel || '',
            speed: speedFn(ms.baseStats.spe),
            min: baseSpeedAt50(ms.baseStats.spe),
            max: maxSpeedAt50(ms.baseStats.spe),
        }));
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* Erst der Champions-Bildweg (eigene gespiegelte Datei), dann die
     * alten Wege — siehe den Kommentar in app-side-quest.js. */
    function pokemonIconHtml(name, size) {
        const slug = String(name || '').toLowerCase();
        if (window.championsSprite && typeof window.championsSprite.img === 'function') {
            const html = window.championsSprite.img(
                name, `tcg-pokemon-icon tcg-pokemon-icon--${size || 'md'}`);
            if (html) return html;
        }
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(slug, { size: size || 'md', alt: name });
        }
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + slug + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--${size || 'md'}" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    // ── Speed Ladder ───────────────────────────────────────────────
    // User-flagged 2026-06-15: "wir müssen irgendwie eine Lösung
    // finden wie ich auf dem Smartphone meine Infos und die des
    // Gegners auf einem Blick sehe ohne zu scrollen". The ladder is
    // the answer — one compact row per pokémon, both teams ranked by
    // effective Speed, fits 12 rows in ≤ 400 px (iPhone safe area).
    //
    // Yours uses actual Speed (from EVs + nature). Opponent uses the
    // typical Speed from the top-team data when available; falls back
    // to base L50 with a visible "?" marker when the species isn't
    // represented.

    function buildSpeedLadder(team, opponent, lookupSpec, typicalMap) {
        const rows = [];
        for (const p of (team && team.pokemon) || []) {
            const spec = lookupSpec(p.name);
            if (!spec || !spec.baseStats) continue;
            const baseSpe = spec.baseStats.spe;
            const evs = parseEVs(p.evs);
            const natMod = natureSpeedMod(p.nature);
            const actual = actualSpeedAt50(baseSpe, evs.spe, natMod);
            const baseMin = baseSpeedAt50(baseSpe);
            const baseMax = maxSpeedAt50(baseSpe);
            // Mega Evolution (held Mega Stone) changes the base Speed —
            // surface the post-Mega Speed + range on a sub-line. Your own
            // item picks exactly one form, so this is 0 or 1 entry.
            const mega = lookupMega(p.name, p.item);
            const megas = buildMegaList(mega ? [mega] : [], baseMin, baseMax,
                (spe) => actualSpeedAt50(spe, evs.spe, natMod));
            rows.push({
                side: 'Y',
                name: p.name,
                speed: actual,
                megas,
                tailwind: actual * 2,
                rangeMin: baseMin,
                rangeMax: baseMax,
                types: spec.types || [],
                source: 'actual',
                evMode: evs.spe,
                natureMode: p.nature || '',
                sampleSize: 1,
            });
        }
        for (const o of (opponent || [])) {
            if (!o || !o.name) continue;
            const spec = lookupSpec(o.name);
            if (!spec || !spec.baseStats) continue;
            const baseSpe = spec.baseStats.spe;
            const rangeMin = baseSpeedAt50(baseSpe);
            const rangeMax = maxSpeedAt50(baseSpe);
            // Mega POTENTIAL — opponent item is unknown, so show EVERY
            // Mega form the species has (X and Y both, when present).
            // The range is spread-independent; the per-form Speed mirrors
            // the basis of the row's own (typical or base) Speed.
            const megaSpecs = listMegaSpecies(o.name);
            const typ = typicalMap && typicalMap[o.name];
            if (typ && typ.typicalSpeed > 0) {
                const megas = buildMegaList(megaSpecs, rangeMin, rangeMax,
                    (spe) => actualSpeedAt50(spe, typ.evMode, natureSpeedMod(typ.natureMode)));
                rows.push({
                    side: 'O', name: o.name,
                    speed: typ.typicalSpeed,
                    megas,
                    tailwind: typ.typicalSpeed * 2,
                    rangeMin, rangeMax,
                    types: spec.types || [],
                    source: 'typical',
                    evMode: typ.evMode,
                    natureMode: typ.natureMode,
                    sampleSize: typ.sampleSize,
                });
            } else {
                // Unknown spread — base L50, no Tailwind value
                // (we don't know if opponent has +nature investment).
                const megas = buildMegaList(megaSpecs, rangeMin, rangeMax,
                    (spe) => baseSpeedAt50(spe));
                rows.push({
                    side: 'O', name: o.name,
                    speed: rangeMin,
                    megas,
                    tailwind: rangeMin * 2,
                    rangeMin, rangeMax,
                    types: spec.types || [],
                    source: 'base',
                    evMode: 0,
                    natureMode: '',
                    sampleSize: 0,
                });
            }
        }
        rows.sort((a, b) => {
            if (b.speed !== a.speed) return b.speed - a.speed;
            // Tiebreak: yours first (you usually win the tie), then alpha
            if (a.side !== b.side) return a.side === 'Y' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        return rows;
    }

    function renderSpeedLadder() {
        const labels = t();
        const rows = buildSpeedLadder(_playTeam, _opponent, (n) => lookupSpecies(n), _typicalSpeeds);
        if (rows.length === 0) {
            return '';  // nothing to ladder yet (pokedex still loading)
        }
        const rowHtml = rows.map((r, i) => {
            // Prefix instead of superscript abbreviation: "~" is the
            // universal "approximately" glyph, can't be misread as
            // "Type" the way the old "typ" abbreviation could.
            // (User-asked 2026-06-15: clear up the typ/Typ confusion.)
            let prefix = '';
            let prefixTitle = '';
            if (r.source === 'typical') {
                prefix = '~';
                prefixTitle = labels.typicalTitle(r.evMode, r.natureMode || '—', r.sampleSize);
            } else if (r.source === 'base') {
                prefix = '?';
                prefixTitle = labels.fallbackBase(0);
            }
            const prefixHtml = prefix
                ? `<span class="sq-play-ladder-prefix${r.source === 'base' ? ' sq-play-ladder-prefix-base' : ''}" title="${escapeHtml(prefixTitle)}">${escapeHtml(prefix)}</span>`
                : '';
            // Mega info goes on its own full-width sub-line (grid-column
            // 1 / -1) below the main row — the speed/range columns are
            // too narrow to hold it without overlapping the tailwind
            // column, and X/Y dual megas need room for two entries.
            // For unknown-spread opponents (source 'base') the single
            // Speed equals the range minimum, so we drop it (and its
            // confusing "?" floor marker) and show just the range.
            const megaLineHtml = (r.megas && r.megas.length)
                ? `<div class="sq-play-ladder-megaline">${r.megas.map(m => {
                       const tag = labels.megaShort + (m.label ? '‑' + m.label : '');
                       const speedPart = (r.source === 'base')
                           ? ''
                           : `${escapeHtml(prefix)}${m.speed} `;
                       return `<span class="sq-play-ladder-mega" title="${escapeHtml(labels.megaTitle(r.speed, m.speed))}">`
                           + `<b>${escapeHtml(tag)}</b> ${speedPart}`
                           + `<small>${m.min}–${m.max}</small></span>`;
                   }).join('')}</div>`
                : '';
            return `
                <li class="sq-play-ladder-row sq-play-ladder-${r.side === 'Y' ? 'yours' : 'opp'}">
                    <span class="sq-play-ladder-rank">${i + 1}</span>
                    ${pokemonIconHtml(r.name, 'sm')}
                    <span class="sq-play-ladder-name">${escapeHtml(r.name)}</span>
                    <span class="sq-play-ladder-side" title="${escapeHtml(r.side === 'Y' ? labels.sideYours : labels.sideOpp)}">${escapeHtml(r.side)}</span>
                    <span class="sq-play-ladder-speed">${prefixHtml}${r.speed}</span>
                    <span class="sq-play-ladder-range" title="${escapeHtml(labels.rangeTitle)}">${r.rangeMin}–${r.rangeMax}</span>
                    <span class="sq-play-ladder-tw" title="${escapeHtml(labels.tailwind)}">${escapeHtml(labels.tailwindLabel)} ${r.tailwind}</span>
                    ${megaLineHtml}
                </li>`;
        }).join('');
        return `
            <section class="sq-play-ladder" aria-label="${escapeHtml(labels.speedLadder)}">
                <header class="sq-play-ladder-head">
                    <h4 class="sq-play-col-title">${escapeHtml(labels.speedLadder)}</h4>
                </header>
                <p class="sq-play-col-hint sq-play-ladder-hint">${escapeHtml(labels.speedLadderHint)}</p>
                <ol class="sq-play-ladder-rows">${rowHtml}</ol>
            </section>
        `;
    }

    // ── Render: one of your-team rows ──────────────────────────────
    function renderYourMon(p) {
        const labels = t();
        const species = lookupSpecies(p.name);
        const types = species ? species.types : [];
        const baseSpe = species ? species.baseStats.spe : null;
        const evs = parseEVs(p.evs);
        const natMod = natureSpeedMod(p.nature);

        let speedHtml = '';
        if (baseSpe != null) {
            const base   = baseSpeedAt50(baseSpe);
            const max    = maxSpeedAt50(baseSpe);
            const actual = actualSpeedAt50(baseSpe, evs.spe, natMod);
            const tail   = actual * 2;
            const mega   = lookupMega(p.name, p.item);
            const megaActual = mega ? actualSpeedAt50(mega.baseStats.spe, evs.spe, natMod) : null;
            const megaMin = mega ? baseSpeedAt50(mega.baseStats.spe) : null;
            const megaMax = mega ? maxSpeedAt50(mega.baseStats.spe) : null;
            const megaHtml = (megaActual != null && megaActual !== actual)
                ? `<span class="sq-play-speed-mega" title="${escapeHtml(labels.megaTitle(actual, megaActual))}">${escapeHtml(labels.megaShort)}&nbsp;${megaActual}</span>`
                : '';
            const megaRangeHtml = (megaMin != null && (megaMin !== base || megaMax !== max))
                ? `<span class="sq-play-speed-mega sq-play-speed-mega-range" title="${escapeHtml(labels.megaRangeTitle(megaMin, megaMax))}">${escapeHtml(labels.megaShort)}&nbsp;${megaMin}–${megaMax}</span>`
                : '';
            speedHtml = `
                <div class="sq-play-speed">
                    <span class="sq-play-speed-actual" title="${escapeHtml(labels.actual)} @ L50, ${p.nature || 'Hardy'}, ${evs.spe} EVs">${actual}</span>
                    ${megaHtml}
                    <span class="sq-play-speed-tail" title="${escapeHtml(labels.tailwind)}">(${tail})</span>
                    <span class="sq-play-speed-range" title="${escapeHtml(labels.base)} ${base} · ${escapeHtml(labels.max)} ${max}">${base}–${max}</span>
                    ${megaRangeHtml}
                </div>`;
        } else {
            speedHtml = `<div class="sq-play-speed sq-play-speed-missing" title="${escapeHtml(labels.unknownSpecies)}">?</div>`;
        }

        const weakHtml = renderWeaknessChips(types);

        return `
            <article class="sq-play-mon">
                <header class="sq-play-mon-head">
                    ${pokemonIconHtml(p.name, 'md')}
                    <div class="sq-play-mon-titleblock">
                        <span class="sq-play-mon-name">${escapeHtml(p.name)}</span>
                        ${renderTypeBadges(types)}
                    </div>
                </header>
                <div class="sq-play-mon-row">
                    <span class="sq-play-row-label">${escapeHtml(labels.speed)}</span>
                    ${speedHtml}
                </div>
                <div class="sq-play-mon-row sq-play-mon-row-weak">
                    <span class="sq-play-row-label">${escapeHtml(labels.weaknesses)}</span>
                    ${weakHtml}
                </div>
            </article>`;
    }

    function renderTypeBadges(types) {
        if (!types || !types.length) return '';
        return `<span class="sq-play-types">` +
            types.map(ty => `<span class="sq-play-type sq-play-type-${ty.toLowerCase()}">${escapeHtml(ty)}</span>`).join('') +
            `</span>`;
    }

    function renderWeaknessChips(types) {
        const labels = t();
        if (!types || types.length === 0) return `<span class="sq-play-noweak">—</span>`;
        const weaknesses = defensiveWeaknesses(types);
        if (weaknesses.length === 0) {
            return `<span class="sq-play-noweak">${escapeHtml(labels.noWeak)}</span>`;
        }
        return `<span class="sq-play-weaks">` +
            weaknesses.map(w =>
                `<span class="sq-play-weak sq-play-type-${w.type.toLowerCase()}${w.mult >= 4 ? ' sq-play-weak-4x' : ''}">${escapeHtml(w.type)}<small>×${w.mult}</small></span>`
            ).join('') + `</span>`;
    }

    // ── Render: opponent slot (empty placeholder until tapped) ──────
    function renderOpponentSlot(idx, mon) {
        const labels = t();
        if (!mon) {
            return `
                <button class="sq-play-opp-slot sq-play-opp-empty"
                        data-opp-idx="${idx}" type="button"
                        aria-label="${escapeHtml(labels.tap)} — slot ${idx + 1}">
                    <span class="sq-play-opp-empty-icon">＋</span>
                    <span class="sq-play-opp-empty-label">${escapeHtml(labels.empty)}</span>
                </button>`;
        }
        const species = lookupSpecies(mon.name);
        const types = species ? species.types : [];
        const baseSpe = species ? species.baseStats.spe : null;
        const typ = _typicalSpeeds && _typicalSpeeds[mon.name];
        let speedHtml;
        if (baseSpe == null) {
            speedHtml = `<span class="sq-play-opp-speed">?</span>`;
        } else {
            const baseV = baseSpeedAt50(baseSpe);
            const maxV  = maxSpeedAt50(baseSpe);
            if (typ) {
                speedHtml = `
                    <span class="sq-play-opp-speed sq-play-opp-speed-typ"
                          title="${escapeHtml(labels.typicalTitle(typ.evMode, typ.natureMode || '—', typ.sampleSize))}">
                        <strong>~${typ.typicalSpeed}</strong>
                        <small>${baseV}–${maxV}</small>
                    </span>`;
            } else {
                speedHtml = `<span class="sq-play-opp-speed">${baseV}–${maxV}</span>`;
            }
        }
        return `
            <article class="sq-play-opp-slot sq-play-opp-filled" data-opp-idx="${idx}">
                <button class="sq-play-opp-clear" type="button"
                        data-opp-clear="${idx}"
                        aria-label="${escapeHtml(labels.clearOpp)}">×</button>
                ${pokemonIconHtml(mon.name, 'md')}
                <span class="sq-play-opp-name">${escapeHtml(mon.name)}</span>
                ${renderTypeBadges(types)}
                ${speedHtml}
            </article>`;
    }

    // Index of the next still-empty opponent slot, or -1 if all 6 are
    // filled. Pulled out as a pure helper so the test suite can pin
    // down the rapid-fire fill order independent of DOM.
    function nextEmptyOppIndex(opponent) {
        if (!Array.isArray(opponent)) return -1;
        for (let i = 0; i < opponent.length; i++) {
            if (!opponent[i]) return i;
        }
        return -1;
    }

    // ── Sprite picker (sub-modal) ──────────────────────────────────
    // Two modes:
    //   - single-slot: legacy "tap a specific empty slot → pick one →
    //                  picker closes" flow. Still wired on per-slot
    //                  tap so the user can replace any individual mon.
    //   - fill-mode:   user-flagged 2026-06-14: one tap on "Quick-pick
    //                  all 6" opens the picker and KEEPS it open while
    //                  the user rattles through the opponent's six
    //                  mons. Each pick lands in the next empty slot,
    //                  search input clears for the next keystroke, and
    //                  the picker auto-closes once 6 / 6 are filled.
    //                  Manual × / Esc still works mid-flow.
    function openSpritePicker(onPick, options) {
        closeSpritePicker();
        const labels = t();
        const fillMode = !!(options && options.fillMode);
        const overlay = document.createElement('div');
        overlay.id = 'sq-play-picker';
        overlay.className = 'sq-play-picker-overlay' + (fillMode ? ' sq-play-picker-fillmode' : '');
        overlay.innerHTML = `
            <div class="sq-play-picker-panel" role="dialog" aria-modal="true">
                ${renderPickerHead(labels, fillMode)}
                <div class="sq-play-picker-grid" id="sq-play-picker-grid"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const grid = overlay.querySelector('#sq-play-picker-grid');

        const updateGrid = (filter) => {
            const { names } = pickerSortedNames();
            const f = String(filter || '').toLowerCase().trim();
            // Multi-source matcher: English Showdown name + German base
            // species name (Knakrack→Garchomp) + type names in EN/DE
            // (Eis→every Ice-type). One toLowerCase per keystroke.
            const matches = f
                ? names.filter(n => speciesMatchesFilter(n, f)).slice(0, 200)
                : names.slice(0, 200);
            grid.innerHTML = matches.length
                ? matches.map(n => spriteCellHtml(n)).join('')
                : `<p class="sq-play-picker-empty">${escapeHtml(
                    uiLang() === 'de' ? 'Kein Treffer — Filter ändern oder „Alle anzeigen".'
                                      : 'No match — adjust filter or "Show all".')}</p>`;
        };
        const rerenderHead = () => {
            const headEl = overlay.querySelector('.sq-play-picker-head');
            if (headEl) headEl.outerHTML = renderPickerHead(labels, fillMode);
            rebind();
        };
        const rebind = () => {
            const newInput = overlay.querySelector('.sq-play-picker-search');
            if (newInput) {
                newInput.addEventListener('input', () => updateGrid(newInput.value));
                setTimeout(() => newInput.focus(), 30);
            }
            const closeBtn = overlay.querySelector('.sq-play-picker-close');
            if (closeBtn) closeBtn.addEventListener('click', closeSpritePicker);
            const toggle = overlay.querySelector('.sq-play-picker-toggle');
            if (toggle) toggle.addEventListener('click', () => {
                _showAllInPicker = !_showAllInPicker;
                rerenderHead();
                updateGrid(overlay.querySelector('.sq-play-picker-search').value);
            });
        };

        rebind();
        updateGrid('');

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSpritePicker();
            const cell = e.target.closest('.sq-play-picker-cell');
            if (cell) {
                const name = cell.getAttribute('data-name');
                if (!name) return;
                const consumed = onPick({ name });
                if (fillMode) {
                    if (consumed === false) {
                        closeSpritePicker();
                        return;
                    }
                    const inp = overlay.querySelector('.sq-play-picker-search');
                    if (inp) inp.value = '';
                    rerenderHead();          // refreshes "Pick 4 / 6" progress chip
                    updateGrid('');
                } else {
                    closeSpritePicker();
                }
            }
        });
        _pickerKeyHandler = (e) => { if (e.key === 'Escape') closeSpritePicker(); };
        document.addEventListener('keydown', _pickerKeyHandler);

        // Autofocus loses on iOS when an overlay opens; nudge it.
        const initialInput = overlay.querySelector('.sq-play-picker-search');
        setTimeout(() => initialInput && initialInput.focus(), 30);
    }

    function renderPickerHead(labels, fillMode) {
        const { names, usingFull, dexSize } = pickerSortedNames();
        const poolSize = names.length;
        const toggleLabel = usingFull
            ? labels.poolLegal.replace('{count}', (_legalPool && _legalPool.size) || 0)
            : labels.poolAll.replace('{count}', dexSize);
        const counterText = `${poolSize}`;
        const filledCount = _opponent.filter(Boolean).length;
        const progressChip = fillMode
            ? `<span class="sq-play-picker-progress" aria-live="polite">${escapeHtml(labels.fillProgress(filledCount + 1, 6))}</span>`
            : '';
        return `
            <header class="sq-play-picker-head">
                ${progressChip}
                <input type="search" class="sq-play-picker-search"
                       placeholder="${escapeHtml(labels.searchPh)}"
                       autocomplete="off" inputmode="search" autofocus>
                <button type="button" class="sq-play-picker-toggle"
                        aria-pressed="${usingFull ? 'true' : 'false'}"
                        title="${escapeHtml(toggleLabel)}">
                    ${usingFull ? '⤓' : '⤒'} <span class="sq-play-picker-toggle-count">${escapeHtml(counterText)}</span>
                </button>
                <button type="button" class="sq-play-picker-close"
                        aria-label="${escapeHtml(labels.pickerClose)}">×</button>
            </header>`;
    }

    let _pickerKeyHandler = null;

    function closeSpritePicker() {
        const el = document.getElementById('sq-play-picker');
        if (el) el.remove();
        if (_pickerKeyHandler) {
            document.removeEventListener('keydown', _pickerKeyHandler);
            _pickerKeyHandler = null;
        }
    }

    function spriteCellHtml(name) {
        const usage = (_usageCount && _usageCount.get(name)) || 0;
        const badge = usage > 0
            ? `<span class="sq-play-picker-cell-usage" title="${escapeHtml(t().usedNxTimes(usage))}">${usage}</span>`
            : '';
        return `<button type="button" class="sq-play-picker-cell${usage > 0 ? ' sq-play-picker-cell-played' : ''}"
                        data-name="${escapeHtml(name)}"
                        title="${escapeHtml(name)}${usage > 0 ? ' · ' + t().usedNxTimes(usage) : ''}">
                    ${pokemonIconHtml(name, 'sm')}
                    <span class="sq-play-picker-cell-name">${escapeHtml(name)}</span>
                    ${badge}
                </button>`;
    }

    // ── Play modal (top-level) ───────────────────────────────────────
    let _playOverlay = null;
    let _opponent = [null, null, null, null, null, null];
    let _playKeyHandler = null;
    let _playTeam = null;

    async function openPlayModal(team) {
        closePlayModal();
        _playTeam = team;
        _opponent = [null, null, null, null, null, null];
        // Four loads in parallel — pokedex for stats/typing, legal-
        // pool seed (top-20 fallback), speed corpus for the wider
        // typical-Speed estimate AND the broader picker pool, and the
        // German species names for multi-lingual search.
        await Promise.all([loadPokedex(), loadLegalPool(), loadSpeedCorpus(), loadNamesDe()]);

        const labels = t();
        const overlay = document.createElement('div');
        overlay.id = 'sq-play-overlay';
        overlay.className = 'sq-play-overlay';
        overlay.innerHTML = `
            <div class="sq-play-panel" role="dialog" aria-modal="true"
                 aria-label="${escapeHtml(labels.playAria)}">
                <header class="sq-play-head">
                    <h3 class="sq-play-title">${escapeHtml(team.team_name || labels.playAria)}</h3>
                    <button type="button" class="sq-play-close"
                            aria-label="${escapeHtml(labels.close)}">×</button>
                </header>
                <div class="sq-play-body">
                    <div id="sq-play-ladder-mount">${renderSpeedLadder()}</div>
                    <section class="sq-play-col sq-play-col-yours">
                        <h4 class="sq-play-col-title">${escapeHtml(labels.yourTeam)}</h4>
                        <div class="sq-play-mons">
                            ${(team.pokemon || []).map(renderYourMon).join('')}
                        </div>
                    </section>
                    <section class="sq-play-col sq-play-col-opp">
                        <div class="sq-play-col-titlebar">
                            <h4 class="sq-play-col-title">${escapeHtml(labels.opponentTeam)}</h4>
                            <button type="button" class="sq-play-quickpick-btn"
                                    aria-label="${escapeHtml(labels.quickPickAria)}">
                                ${escapeHtml(labels.quickPick)}
                            </button>
                        </div>
                        <p class="sq-play-col-hint">${escapeHtml(labels.opponentHint)}</p>
                        <div class="sq-play-opps" id="sq-play-opps">
                            ${_opponent.map((m, i) => renderOpponentSlot(i, m)).join('')}
                        </div>
                    </section>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        _playOverlay = overlay;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePlayModal();
            // Quick-pick: keeps the picker open and lands each tap in
            // the next empty slot. Auto-closes when all 6 are filled.
            const quick = e.target.closest('.sq-play-quickpick-btn');
            if (quick) {
                if (nextEmptyOppIndex(_opponent) === -1) {
                    // All slots already filled — wipe and start over,
                    // matches the "just-clicked-it-by-accident vs
                    // intentional reset" expectation of a clearly-CTA-
                    // styled button.
                    _opponent = [null, null, null, null, null, null];
                    rerenderOpponents();
                }
                openSpritePicker((mon) => {
                    const idx = nextEmptyOppIndex(_opponent);
                    if (idx === -1) return false;          // signal: close
                    _opponent[idx] = mon;
                    rerenderOpponents();
                    if (nextEmptyOppIndex(_opponent) === -1) {
                        // Hit 6/6 — small grace delay so the last fill
                        // visually registers before the overlay folds.
                        setTimeout(closeSpritePicker, 220);
                    }
                    return true;
                }, { fillMode: true });
                return;
            }
            const empty = e.target.closest('.sq-play-opp-empty');
            if (empty) {
                const idx = parseInt(empty.getAttribute('data-opp-idx'), 10);
                if (Number.isInteger(idx)) {
                    openSpritePicker((mon) => {
                        _opponent[idx] = mon;
                        rerenderOpponents();
                    });
                }
                return;
            }
            const clear = e.target.closest('[data-opp-clear]');
            if (clear) {
                const idx = parseInt(clear.getAttribute('data-opp-clear'), 10);
                if (Number.isInteger(idx)) {
                    _opponent[idx] = null;
                    rerenderOpponents();
                }
            }
        });
        overlay.querySelector('.sq-play-close')
            .addEventListener('click', closePlayModal);

        _playKeyHandler = (e) => { if (e.key === 'Escape') closePlayModal(); };
        document.addEventListener('keydown', _playKeyHandler);
        overlay.querySelector('.sq-play-close').focus();
    }

    function rerenderOpponents() {
        if (!_playOverlay) return;
        const host = _playOverlay.querySelector('#sq-play-opps');
        if (host) host.innerHTML = _opponent.map((m, i) => renderOpponentSlot(i, m)).join('');
        const ladderMount = _playOverlay.querySelector('#sq-play-ladder-mount');
        if (ladderMount) ladderMount.innerHTML = renderSpeedLadder();
    }

    function closePlayModal() {
        if (_playOverlay) { _playOverlay.remove(); _playOverlay = null; }
        if (_playKeyHandler) {
            document.removeEventListener('keydown', _playKeyHandler);
            _playKeyHandler = null;
        }
        closeSpritePicker();
    }

    // Public surface for sideQuest.js + unit tests
    window.sideQuestPlay = {
        openPlayModal,
        closePlayModal,
        // Pure helpers exposed for tests / future reuse
        defensiveWeaknesses,
        speedStat,
        baseSpeedAt50,
        maxSpeedAt50,
        actualSpeedAt50,
        natureSpeedMod,
        parseEVs,
        aggregateLegalPool,
        aggregateLegalPoolFromSamples,
        nextEmptyOppIndex,
        buildTypicalSpeeds,
        buildTypicalSpeedsFromSamples,
        buildSpeedLadder,
        speciesMatchesFilter,
        baseEnglish,
        labels: () => t(),
    };
})();
