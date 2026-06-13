// Profile Deck Builder — sandbox deck construction in My Profile.
//
// Distinct from the meta-tab deck-builders (which are bound to a
// Current/Past/CL meta context): this one is a pure scratch surface.
// Pick from the entire card database — international standard /
// extended / legacy chunks plus the Japanese database — assemble a
// 60-card deck, paste an existing list to seed it, and see the live
// mulligan probability below.
//
// Storage: localStorage `dipidis.profileDeckBuilder.v1`.
// Card data: reuses window.allCardsDatabase (loaded by app-core.js)
// plus a lazy fetch of data/japanese_cards_database.csv on first
// render (cached for the session).

(function () {
    'use strict';

    const STORAGE_KEY     = 'dipidis.profileDeckBuilder.v1';
    const SEARCH_DEBOUNCE = 150;          // ms — keystroke → render
    const MAX_RESULTS     = 80;            // cap to keep DOM light
    const DECK_SIZE       = 60;
    const HAND_SIZE       = 7;
    const MAX_PER_CARD    = 4;             // standard play limit (4× any
                                            // non-Basic-Energy card)
    const JP_CSV_URL      = 'data/japanese_cards_database.csv';

    // ── State ────────────────────────────────────────────────────────

    let _deck = null;             // { name, cards: [{set,number,count,…}], … }
    let _cardIndex = null;        // flat array of every searchable card
    let _searchTimer = null;
    let _activeFilters = {        // mirrored from the filter chips
        // Meta-format band (radio — pick one). 'all' = no restriction;
        // 'standard'|'extended'|'legacy' restricts intl cards to that
        // chunk. JP cards bypass this gate (they have their own sets).
        meta:    'all',
        // Trainer subtypes are now first-class options here alongside
        // pokemon / energy — see passesFilters for the dispatch.
        type:    new Set(),       // 'pokemon' | 'supporter' | 'item' | 'tool' | 'stadium' | 'energy'
        set:     new Set(),       // set code, e.g. 'CRI'
        energy:  new Set(),       // 'Fire' | 'Water' | …
        rarity:  new Set(),       // 'Common' | 'Rare' | …
        // JP toggle: OFF (default) hides Japanese cards entirely; ON
        // includes them additively next to whatever the intl filters
        // matched. This implements the user's "TEF-CRI + JP" combo:
        // meta=standard + jpInclude=true → all current-meta intl
        // cards PLUS every JP card.
        jpInclude: false,
    };
    let _searchTerm = '';
    let _initialized = false;
    // Sets-per-era index, populated lazily from cards_manifest.json.
    // null until loaded; treat null as "no meta filter possible yet".
    let _setsByEra = null;
    let _metaFormatKey = '';       // "TEF-CRI" sourced from format_window.json
    let _allSetsList = [];          // sorted union of every set in the index

    // ── i18n labels ──────────────────────────────────────────────────

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const T = {
        de: {
            heading:       'Deck Builder',
            subtitle:      'Bau dir aus allen Karten der Datenbank ein eigenes Deck — Suche in Deutsch, Englisch, Set oder Kartentext.',
            searchPh:      'Suchen: Name, Set, Kartentext, Fähigkeit …',
            filterMeta:    'Meta',
            filterMetaAll: 'Alle',
            filterMetaStd: 'Current',           // dynamic key appended at render time, e.g. "Current (TEF-CRI)"
            filterMetaExt: 'Extended',
            filterMetaLeg: 'Legacy',
            filterType:    'Typ',
            filterTypePok: 'Pokémon',
            filterTypeSup: 'Supporter',
            filterTypeItm: 'Item',
            filterTypeTool: 'Tool',
            filterTypeStd: 'Stadion',
            filterTypeEne: 'Energie',
            filterEnergy:  'Energie-Typ',
            filterSet:     'Sets',
            filterSetSearch: 'Set suchen …',
            filterSetNone: 'Keine Sets gewählt — alle aktiv.',
            filterRarity:  'Seltenheit',
            filterJp:      '+ JP einschließen',
            filterClear:   'Filter zurücksetzen',
            results:       'Treffer',
            noResults:     'Keine Karten gefunden. Versuche einen anderen Begriff oder weniger Filter.',
            deckHeading:   'Mein Deck',
            deckNameLbl:   'Deck-Name',
            deckEmpty:     'Noch keine Karten. Suche links und klicke eine Karte an, um sie hinzuzufügen.',
            secPokemon:    'Pokémon',
            secTrainer:    'Trainer',
            secEnergy:     'Energie',
            pasteHeading:  'Deck-Liste als Basis einfügen',
            pasteHelp:     'Füge eine Deck-Liste im Showdown-/Limitless-Format ein (z. B. „4 Charizard ex OBF 125"). Karten werden ans aktuelle Deck angehängt.',
            pasteBtn:      'Liste übernehmen',
            pasteAdded:    (n, miss) => `${n} Karte(n) hinzugefügt` + (miss ? ` · ${miss} Zeilen nicht erkannt` : ''),
            clearBtn:      'Deck leeren',
            mulliganTitle: 'Eröffnungs-Hand (7 Karten)',
            mulliganBasic: 'Basis-Pokémon in der Hand',
            mulliganMull:  'Mulligan',
            mulliganNote:  (b, t) => `(${b} Basis-Pokémon / ${t} Karten)`,
            mulliganEmpty: 'Füge mindestens ein Basis-Pokémon zum Deck hinzu, um die Wahrscheinlichkeit zu sehen.',
            mulliganUnder: (n) => `⚠ Nur ${n} Karten im Deck — ein Turnier-Deck braucht genau 60.`,
            jpBadge:       'JP',
            cardCount:     (n) => `${n} / ${DECK_SIZE} Karten`,
            addAria:       (name) => `${name} ins Deck hinzufügen`,
            removeAria:    (name) => `${name} aus dem Deck entfernen`,
            illegalMax:    (n) => `Mehr als ${MAX_PER_CARD}× pro Karte ist nicht erlaubt (außer Standard-Energien).`,
        },
        en: {
            heading:       'Deck Builder',
            subtitle:      'Build a deck from every card in the database — search by German name, English name, set code or card text.',
            searchPh:      'Search: name, set, card text, ability …',
            filterMeta:    'Meta',
            filterMetaAll: 'All',
            filterMetaStd: 'Current',
            filterMetaExt: 'Extended',
            filterMetaLeg: 'Legacy',
            filterType:    'Type',
            filterTypePok: 'Pokémon',
            filterTypeSup: 'Supporter',
            filterTypeItm: 'Item',
            filterTypeTool: 'Tool',
            filterTypeStd: 'Stadium',
            filterTypeEne: 'Energy',
            filterEnergy:  'Energy type',
            filterSet:     'Sets',
            filterSetSearch: 'Search set …',
            filterSetNone: 'No sets picked — all active.',
            filterRarity:  'Rarity',
            filterJp:      '+ Include JP',
            filterClear:   'Clear filters',
            results:       'Results',
            noResults:     'No cards found. Try a different term or fewer filters.',
            deckHeading:   'My Deck',
            deckNameLbl:   'Deck name',
            deckEmpty:     'No cards yet. Search on the left and click a card to add it.',
            secPokemon:    'Pokémon',
            secTrainer:    'Trainer',
            secEnergy:     'Energy',
            pasteHeading:  'Paste a deck list as a base',
            pasteHelp:     'Paste a deck list in Showdown/Limitless format (e.g. "4 Charizard ex OBF 125"). Cards get appended to the current deck.',
            pasteBtn:      'Import list',
            pasteAdded:    (n, miss) => `Added ${n} card(s)` + (miss ? ` · ${miss} lines not recognised` : ''),
            clearBtn:      'Clear deck',
            mulliganTitle: 'Opening hand (7 cards)',
            mulliganBasic: 'Basic in hand',
            mulliganMull:  'Mulligan',
            mulliganNote:  (b, t) => `(${b} Basics / ${t} cards)`,
            mulliganEmpty: 'Add at least one Basic Pokémon to see the mulligan probability.',
            mulliganUnder: (n) => `⚠ Only ${n} cards in the deck — a tournament deck needs exactly 60.`,
            jpBadge:       'JP',
            cardCount:     (n) => `${n} / ${DECK_SIZE} cards`,
            addAria:       (name) => `Add ${name} to deck`,
            removeAria:    (name) => `Remove ${name} from deck`,
            illegalMax:    (n) => `More than ${MAX_PER_CARD}× per card is not allowed (except basic energy).`,
        },
    };

    function t() { return T[uiLang()]; }

    // ── Persistence ──────────────────────────────────────────────────

    function emptyDeck() {
        return {
            name: '',
            cards: [],          // [{set, number, count, name_en, name_de, type, is_japanese}]
            lastModified: null,
        };
    }

    function loadDeck() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return emptyDeck();
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.cards)) return emptyDeck();
            return parsed;
        } catch (_) {
            return emptyDeck();
        }
    }

    function saveDeck() {
        if (!_deck) return;
        _deck.lastModified = new Date().toISOString();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_deck));
        } catch (e) {
            console.warn('[ProfileDeckBuilder] save failed', e);
        }
    }

    // ── Pure helpers (unit-tested) ───────────────────────────────────

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function cardKey(card) {
        // Same card = same set+number. We never merge prints that share
        // a name but ship in different sets (e.g. multiple Iono prints) —
        // by-set-number matches how the deck-list format encodes cards.
        return ((card.set || '') + '-' + (card.number || '')).toUpperCase();
    }

    // Card-kind detection. CHECK ORDER MATTERS: Energy and Trainer
    // labels are tested first because "Basic Energy" would otherwise
    // collide with the "Basic" (Pokémon) keyword — the substring
    // matches both. Once we know it's energy/trainer we don't fall
    // through to the Pokémon branch.
    const _POKEMON_TYPES = new Set([
        'basic', 'stage 1', 'stage 2', 'mega', 'vmax', 'vstar', 'v-union',
        'break', 'legend', 'restored', 'level-up',
    ]);
    const _TRAINER_TYPES = new Set([
        'supporter', 'item', 'stadium', 'tool', 'pokémon tool', 'pokemon tool',
        'technical machine', 'trainer',
    ]);

    function isEnergy(card) {
        // Anything labelled "*energy*" / "*energie*" (DE) — covers
        // "Basic Energy" and "Special Energy".
        const t = (card.type || '').toLowerCase();
        return /\benerg(y|ie)\b/.test(t);
    }

    function isTrainer(card) {
        const t = (card.type || '').toLowerCase().trim();
        if (_TRAINER_TYPES.has(t)) return true;
        // Some legacy rows label trainers as "Pokémon Tool" or similar
        // multi-word variants — keep a loose fallback for those.
        return /(supporter|stadium|technical machine)/.test(t)
            || /\btool\b/.test(t)
            || /\bitem\b/.test(t);
    }

    function isPokemon(card) {
        if (isEnergy(card) || isTrainer(card)) return false;
        const t = (card.type || '').toLowerCase().trim();
        return _POKEMON_TYPES.has(t);
    }

    function isBasicPokemon(card) {
        if (isEnergy(card)) return false;
        return (card.type || '').toLowerCase().trim() === 'basic';
    }

    function isBasicEnergy(card) {
        // Basic energies are unlimited per deck; special energies cap at 4.
        const t = (card.type || '').toLowerCase().trim();
        return t === 'basic energy' || t === 'basis energie' || t === 'basis-energie';
    }

    // Trainer subtype detection. Returns 'supporter' | 'item' |
    // 'tool' | 'stadium' | null. Used by the type filter to let
    // users narrow Trainers further; null means the card isn't a
    // trainer at all (caller handles that — usually returns false
    // when a trainer subtype is in the active filter set).
    function trainerSubtype(card) {
        if (!isTrainer(card)) return null;
        const t = (card.type || '').toLowerCase().trim();
        if (t === 'supporter') return 'supporter';
        if (t === 'stadium')   return 'stadium';
        if (t === 'tool' || t === 'pokémon tool' || t === 'pokemon tool') return 'tool';
        // "Item" + "Technical Machine" + bare "Trainer" all land here —
        // they're the catch-all bucket users mentally call "items".
        return 'item';
    }

    function countCards(deck) {
        return (deck.cards || []).reduce((s, c) => s + (c.count || 0), 0);
    }

    function countBasics(deck) {
        return (deck.cards || []).reduce(
            (s, c) => s + (isBasicPokemon(c) ? (c.count || 0) : 0),
            0,
        );
    }

    // ── Mulligan math ───────────────────────────────────────────────
    // P(at least one Basic in opening hand) = 1 − C(N-B, h) / C(N, h)
    // where N = deck size, B = basics, h = hand size (7).
    //
    // Implemented as a ratio of falling factorials to avoid factorial
    // overflow and to short-circuit obvious edge cases.

    function mulliganProbability(basics, deckSize, handSize) {
        if (deckSize <= 0 || handSize <= 0) return null;
        if (basics <= 0) return { basicInHand: 0, mulligan: 1 };
        if (basics >= deckSize) return { basicInHand: 1, mulligan: 0 };
        const draws = Math.min(handSize, deckSize);
        const nonBasic = deckSize - basics;
        if (nonBasic < draws) return { basicInHand: 1, mulligan: 0 };
        // P(no basic) = product over i in [0..draws-1] of (nonBasic - i) / (deckSize - i)
        let p = 1;
        for (let i = 0; i < draws; i++) {
            p *= (nonBasic - i) / (deckSize - i);
            if (p <= 0) { p = 0; break; }
        }
        return { basicInHand: 1 - p, mulligan: p };
    }

    // ── Deck-list paste parser ──────────────────────────────────────
    // Accepts Showdown / Limitless / PTCGL "1 Card Name SET 123" lines.
    // Section headers ("Pokémon: 17") and blank lines are ignored.
    // Returns {entries: [{count, name, set, number}], unknownLines: [...]}.

    function parseDeckList(text) {
        const out = { entries: [], unknownLines: [] };
        if (!text) return out;
        const lines = String(text).split(/\r?\n/);
        // Tight pattern: count, then everything (name), then SET + number.
        const lineRe = /^\s*(\d+)\s+(.+?)\s+([A-Z][A-Z0-9]+)\s+([A-Za-z0-9]+)\s*$/;
        // Loose fallback: just "count Card Name" (no set/number).
        const looseRe = /^\s*(\d+)\s+(.+?)\s*$/;
        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;
            // Skip section headers like "Pokémon: 17" / "Total Cards: 60".
            if (/:\s*\d+\s*$/.test(line)) continue;
            if (/^[A-Za-zÀ-ÿ ]+:\s*$/.test(line)) continue;
            const m = lineRe.exec(line);
            if (m) {
                out.entries.push({
                    count:  Math.max(1, parseInt(m[1], 10) || 1),
                    name:   m[2].trim(),
                    set:    m[3].toUpperCase(),
                    number: m[4].toUpperCase(),
                });
                continue;
            }
            const lm = looseRe.exec(line);
            if (lm) {
                out.entries.push({
                    count:  Math.max(1, parseInt(lm[1], 10) || 1),
                    name:   lm[2].trim(),
                    set:    '',
                    number: '',
                });
                continue;
            }
            out.unknownLines.push(line);
        }
        return out;
    }

    // ── Search matching ─────────────────────────────────────────────
    // Matches the term against name_en, name_de, set, set+number, and
    // card_text (case-insensitive). The order is "name fields first"
    // so the cheap checks short-circuit before the expensive card_text
    // substring scan.

    function matchesSearch(card, term) {
        if (!term) return true;
        const t = term.toLowerCase().trim();
        if (!t) return true;
        const fields = [
            card.name_en || '',
            card.name_de || '',
            card.set || '',
            `${card.set || ''}-${card.number || ''}`,
            `${card.set || ''} ${card.number || ''}`,
            `${card.set || ''}${card.number || ''}`,
        ];
        for (const f of fields) {
            if (f && f.toLowerCase().indexOf(t) !== -1) return true;
        }
        // Card text last — fairly expensive on a 20k corpus.
        if (card.card_text && card.card_text.toLowerCase().indexOf(t) !== -1) return true;
        return false;
    }

    // Decide whether a card belongs to the kind(s) in the type filter
    // set. Trainer subtypes (supporter / item / tool / stadium) are
    // first-class — selecting 'item' shows only item Trainers, not all
    // Trainers. Pokemon / energy are unchanged broad buckets.
    function _matchesTypeFilter(card, typeSet) {
        if (typeSet.size === 0) return true;
        if (isPokemon(card))      return typeSet.has('pokemon');
        if (isEnergy(card))       return typeSet.has('energy');
        const sub = trainerSubtype(card);
        if (sub) return typeSet.has(sub);
        return false;
    }

    // Meta-format dispatch. Intl cards live in one of three chunks
    // (standard / extended / legacy); the JP cards live in their own
    // dataset and always pass the meta gate (they have their own JP
    // set codes that wouldn't be in the intl chunks anyway).
    function _matchesMetaFilter(card, meta, setsByEra) {
        if (card.is_japanese) return true;
        if (meta === 'all' || !meta) return true;
        if (!setsByEra) return true;   // index not loaded yet — don't gate
        if (meta === 'standard') return setsByEra.standard.has(card.set);
        if (meta === 'extended') return setsByEra.standard.has(card.set)
                                     || setsByEra.extended.has(card.set);
        if (meta === 'legacy')   return true;   // legacy ⊇ everything
        return true;
    }

    function passesFilters(card, filters, setsByEra) {
        // JP toggle is the outermost gate: if jpInclude is off and the
        // card is Japanese, drop it before anything else runs. When
        // jpInclude is on, JP cards still need to clear the OTHER
        // filters (type, set, search) — the meta filter is skipped via
        // _matchesMetaFilter so "TEF-CRI + JP" actually returns both
        // sides at once.
        if (card.is_japanese && !filters.jpInclude) return false;
        if (!_matchesMetaFilter(card, filters.meta, setsByEra || _setsByEra)) return false;
        if (!_matchesTypeFilter(card, filters.type)) return false;
        if (filters.set.size > 0 && !filters.set.has(card.set)) return false;
        if (filters.energy.size > 0 && !filters.energy.has(card.energy_type || '')) return false;
        if (filters.rarity.size > 0 && !filters.rarity.has(card.rarity || '')) return false;
        return true;
    }

    // ── Card index (intl + JP) ──────────────────────────────────────

    async function loadJapaneseCards() {
        try {
            const resp = await fetch(JP_CSV_URL + '?t=' + Date.now());
            if (!resp.ok) return [];
            const text = await resp.text();
            return parseJpCsv(text);
        } catch (e) {
            console.warn('[ProfileDeckBuilder] JP CSV load failed', e);
            return [];
        }
    }

    function parseJpCsv(text) {
        // The JP CSV is dense (name,set,number,type,rarity,image_url) and
        // doesn't contain quoted commas, so a basic split is safe enough.
        // Falls back to skipping malformed rows.
        const lines = text.split(/\r?\n/);
        const head = (lines.shift() || '').split(',').map(s => s.trim());
        const idx = (h) => head.indexOf(h);
        const iName = idx('name'), iSet = idx('set'), iNumber = idx('number'),
              iType = idx('type'), iRarity = idx('rarity'), iImg = idx('image_url');
        const out = [];
        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split(',');
            if (parts.length < head.length) continue;
            out.push({
                name_en:      iName >= 0 ? parts[iName] : '',
                name_de:      '',
                set:          iSet >= 0 ? parts[iSet] : '',
                number:       iNumber >= 0 ? parts[iNumber] : '',
                type:         iType >= 0 ? parts[iType] : '',
                energy_type:  '',
                hp:           '',
                rarity:       iRarity >= 0 ? parts[iRarity] : '',
                image_url:    iImg >= 0 ? parts[iImg] : '',
                card_text:    '',
                is_japanese:  true,
            });
        }
        return out;
    }

    async function buildCardIndex() {
        if (_cardIndex) return _cardIndex;
        const intl = Array.isArray(window.allCardsDatabase) ? window.allCardsDatabase : [];
        // The CSV-merged objects use slightly different field names —
        // normalise to the schema this module expects.
        const intlNormalised = intl.map(c => ({
            name_en:     c.name_en || c.name || '',
            name_de:     c.name_de || '',
            set:         (c.set || '').toUpperCase(),
            number:      String(c.number || '').toUpperCase(),
            type:        c.type || '',
            energy_type: c.energy_type || '',
            hp:          c.hp || '',
            rarity:      c.rarity || '',
            image_url:   c.image_url || '',
            card_text:   c.card_text || '',
            is_japanese: false,
        }));
        const jp = await loadJapaneseCards();
        _cardIndex = intlNormalised.concat(jp);
        // Tee up the meta-format chunks + format-window key in the
        // background — the result powers the Meta filter chips.
        loadMetaFormatIndex();   // fire-and-forget
        // Cheap one-pass sorted set list for the Set-filter checkbox
        // list. Includes both intl and JP set codes so the JP-only
        // case is browsable too.
        _allSetsList = Array.from(new Set(_cardIndex.map(c => c.set).filter(Boolean))).sort();
        return _cardIndex;
    }

    async function loadMetaFormatIndex() {
        // _setsByEra and _metaFormatKey are populated from the same
        // manifest the main app uses — chunks file → set membership
        // per era; format_window.json → the human-readable meta key
        // (e.g. "TEF-CRI") the user sees on the Meta chip.
        if (_setsByEra) return;
        const setsByEra = { standard: new Set(), extended: new Set(), legacy: new Set() };
        try {
            const manifestResp = await fetch('data/cards_manifest.json?t=' + Date.now());
            if (!manifestResp.ok) throw new Error('manifest HTTP ' + manifestResp.status);
            const manifest = await manifestResp.json();
            const chunks = Array.isArray(manifest.chunks) ? manifest.chunks : [];
            await Promise.all(chunks.map(async (chunk) => {
                const era = String(chunk.era || '').toLowerCase();
                if (!setsByEra[era]) return;
                // Prefer the IndexedDB cache — saves the network round-trip
                // when the user has already loaded the card DB once this
                // session. Falls back to network when the cache is empty.
                let cards = null;
                try {
                    if (window.cardDataCache) {
                        cards = await window.cardDataCache.getCachedChunk(chunk.file);
                    }
                } catch (_) { /* ignore */ }
                if (!cards) {
                    try {
                        const chunkResp = await fetch('data/' + chunk.file + '?t=' + Date.now());
                        if (!chunkResp.ok) return;
                        const json = await chunkResp.json();
                        cards = json.cards || json;
                    } catch (_) { return; }
                }
                if (!Array.isArray(cards)) return;
                for (const c of cards) {
                    if (c && c.set) setsByEra[era].add(String(c.set).toUpperCase());
                }
            }));
        } catch (e) {
            console.warn('[ProfileDeckBuilder] meta-format index failed', e);
        }
        _setsByEra = setsByEra;
        // Resolve the human-readable meta key from format_window.json.
        try {
            const resp = await fetch('data/format_window.json?t=' + Date.now());
            if (resp.ok) {
                const fw = await resp.json();
                if (fw && fw.oldest_legal_set && fw.current_set) {
                    _metaFormatKey = `${fw.oldest_legal_set}-${fw.current_set}`.toUpperCase();
                }
            }
        } catch (_) { /* keep _metaFormatKey empty */ }
        // Re-render the filter row so the dynamic "Current (TEF-CRI)"
        // chip picks up the meta key once it's known.
        if (_initialized && document.getElementById('pdb-filter-row')) {
            renderFilterRow();
        }
    }

    // ── Search results ──────────────────────────────────────────────

    function searchResults() {
        if (!_cardIndex) return [];
        const term = _searchTerm;
        const filters = _activeFilters;
        const hits = [];
        for (const c of _cardIndex) {
            if (!passesFilters(c, filters, _setsByEra)) continue;
            if (!matchesSearch(c, term)) continue;
            hits.push(c);
            if (hits.length >= MAX_RESULTS * 4) break;  // hard ceiling before sort
        }
        // Sort: exact-name matches first, then set, then number numerically.
        const termLower = (term || '').toLowerCase().trim();
        hits.sort((a, b) => {
            const ax = (a.name_en || '').toLowerCase() === termLower ? 0
                     : (a.name_de || '').toLowerCase() === termLower ? 0 : 1;
            const bx = (b.name_en || '').toLowerCase() === termLower ? 0
                     : (b.name_de || '').toLowerCase() === termLower ? 0 : 1;
            if (ax !== bx) return ax - bx;
            const setCmp = (a.set || '').localeCompare(b.set || '');
            if (setCmp !== 0) return setCmp;
            const aN = parseInt(a.number, 10) || 0;
            const bN = parseInt(b.number, 10) || 0;
            return aN - bN;
        });
        return hits.slice(0, MAX_RESULTS);
    }

    // ── Deck mutations ──────────────────────────────────────────────

    function addCard(card) {
        if (!_deck) _deck = emptyDeck();
        const key = cardKey(card);
        const existing = _deck.cards.find(c => cardKey(c) === key);
        if (existing) {
            const isUnlimited = isBasicEnergy(existing);
            if (!isUnlimited && existing.count >= MAX_PER_CARD) {
                // Briefly flash a warning instead of silently capping.
                const msg = t().illegalMax(MAX_PER_CARD);
                console.warn('[ProfileDeckBuilder]', msg);
                pulseToast(msg);
                return;
            }
            existing.count += 1;
        } else {
            _deck.cards.push({
                set:         card.set,
                number:      card.number,
                name_en:     card.name_en,
                name_de:     card.name_de,
                type:        card.type,
                energy_type: card.energy_type,
                rarity:      card.rarity,
                image_url:   card.image_url,
                is_japanese: !!card.is_japanese,
                count:       1,
            });
        }
        saveDeck();
        renderDeckPanel();
        renderMulligan();
    }

    function removeOne(key) {
        if (!_deck) return;
        const card = _deck.cards.find(c => cardKey(c) === key);
        if (!card) return;
        card.count -= 1;
        if (card.count <= 0) {
            _deck.cards = _deck.cards.filter(c => cardKey(c) !== key);
        }
        saveDeck();
        renderDeckPanel();
        renderMulligan();
    }

    function clearDeck() {
        if (!_deck) return;
        _deck.cards = [];
        saveDeck();
        renderDeckPanel();
        renderMulligan();
    }

    function importDeckList(text) {
        const { entries, unknownLines } = parseDeckList(text);
        let added = 0;
        for (const e of entries) {
            const match = findCardForImport(e);
            if (!match) { unknownLines.push(`${e.count} ${e.name} ${e.set} ${e.number}`); continue; }
            for (let i = 0; i < e.count; i++) {
                const key = cardKey(match);
                const existing = _deck.cards.find(c => cardKey(c) === key);
                const unlimited = isBasicEnergy(existing || match);
                if (existing) {
                    if (!unlimited && existing.count >= MAX_PER_CARD) break;
                    existing.count += 1;
                } else {
                    _deck.cards.push({
                        set: match.set, number: match.number,
                        name_en: match.name_en, name_de: match.name_de,
                        type: match.type, energy_type: match.energy_type,
                        rarity: match.rarity, image_url: match.image_url,
                        is_japanese: !!match.is_japanese, count: 1,
                    });
                }
                added += 1;
            }
        }
        saveDeck();
        renderDeckPanel();
        renderMulligan();
        pulseToast(t().pasteAdded(added, unknownLines.length));
    }

    function findCardForImport(entry) {
        if (!_cardIndex) return null;
        if (entry.set && entry.number) {
            const key = `${entry.set}-${entry.number}`.toUpperCase();
            const hit = _cardIndex.find(c => cardKey(c) === key);
            if (hit) return hit;
        }
        // Name-only fallback: prefer English name match, then German.
        const n = (entry.name || '').toLowerCase();
        return _cardIndex.find(c =>
                   (c.name_en || '').toLowerCase() === n
                || (c.name_de || '').toLowerCase() === n
               ) || null;
    }

    // ── Toast ────────────────────────────────────────────────────────

    let _toastTimer = null;
    function pulseToast(msg) {
        const host = document.getElementById('pdb-toast');
        if (!host) return;
        host.textContent = msg;
        host.classList.add('is-visible');
        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => host.classList.remove('is-visible'), 2400);
    }

    // ── Rendering ────────────────────────────────────────────────────

    function renderRoot() {
        const host = document.getElementById('profile-deckbuilder');
        if (!host) return;
        const L = t();
        host.innerHTML = `
            <h2 class="pdb-heading">${escapeHtml(L.heading)}</h2>
            <p class="pdb-subtitle">${escapeHtml(L.subtitle)}</p>

            <div class="pdb-layout">
                <section class="pdb-search-panel" aria-label="${escapeHtml(L.results)}">
                    <input type="text" id="pdb-search" class="pdb-search-input"
                           placeholder="${escapeHtml(L.searchPh)}"
                           aria-label="${escapeHtml(L.searchPh)}">
                    <div id="pdb-filter-row" class="pdb-filter-row"></div>
                    <div class="pdb-results-meta">
                        <span id="pdb-result-count">—</span>
                        <button type="button" class="pdb-link-btn" id="pdb-clear-filters">${escapeHtml(L.filterClear)}</button>
                    </div>
                    <div id="pdb-results" class="pdb-results-grid" role="list"></div>
                </section>

                <section class="pdb-deck-panel" aria-label="${escapeHtml(L.deckHeading)}">
                    <div class="pdb-deck-head">
                        <h3 class="pdb-deck-title">${escapeHtml(L.deckHeading)} <span id="pdb-deck-count" class="pdb-deck-count">${escapeHtml(L.cardCount(0))}</span></h3>
                        <input type="text" id="pdb-deck-name" class="pdb-deck-name-input"
                               placeholder="${escapeHtml(L.deckNameLbl)}"
                               aria-label="${escapeHtml(L.deckNameLbl)}">
                    </div>
                    <div id="pdb-deck-body" class="pdb-deck-body"></div>
                    <div class="pdb-deck-actions">
                        <button type="button" class="pdb-link-btn pdb-link-btn--danger" id="pdb-clear-deck">${escapeHtml(L.clearBtn)}</button>
                    </div>
                </section>
            </div>

            <details class="pdb-paste-panel">
                <summary class="pdb-paste-summary">${escapeHtml(L.pasteHeading)}</summary>
                <p class="pdb-section-help">${escapeHtml(L.pasteHelp)}</p>
                <textarea id="pdb-paste" class="pdb-paste-area" rows="4" spellcheck="false"
                          placeholder="4 Charizard ex OBF 125&#10;3 Pidgeot ex OBF 164&#10;…"></textarea>
                <button type="button" class="btn btn-primary btn-sm" id="pdb-paste-btn">${escapeHtml(L.pasteBtn)}</button>
            </details>

            <section class="pdb-mulligan-panel" aria-live="polite">
                <h3 class="pdb-section-h">${escapeHtml(L.mulliganTitle)}</h3>
                <div id="pdb-mulligan-body" class="pdb-mulligan-body"></div>
            </section>

            <div id="pdb-toast" class="pdb-toast" aria-live="polite"></div>
        `;

        // Hydrate the deck-name input
        document.getElementById('pdb-deck-name').value = _deck.name || '';

        // Wire events
        const searchEl = document.getElementById('pdb-search');
        searchEl.addEventListener('input', () => {
            if (_searchTimer) clearTimeout(_searchTimer);
            _searchTimer = setTimeout(() => {
                _searchTerm = searchEl.value;
                renderResults();
            }, SEARCH_DEBOUNCE);
        });
        document.getElementById('pdb-clear-filters').addEventListener('click', () => {
            _activeFilters = {
                meta:      'all',
                type:      new Set(),
                set:       new Set(),
                energy:    new Set(),
                rarity:    new Set(),
                jpInclude: false,
            };
            _setSearchTerm = '';
            renderFilterRow();
            renderResults();
        });
        document.getElementById('pdb-clear-deck').addEventListener('click', () => {
            if (countCards(_deck) === 0) return;
            if (confirm(uiLang() === 'de' ? 'Wirklich das ganze Deck leeren?' : 'Clear the whole deck?')) {
                clearDeck();
            }
        });
        document.getElementById('pdb-paste-btn').addEventListener('click', () => {
            const txt = document.getElementById('pdb-paste').value;
            importDeckList(txt);
        });
        document.getElementById('pdb-deck-name').addEventListener('input', (e) => {
            _deck.name = e.target.value || '';
            saveDeck();
        });

        renderFilterRow();
        renderResults();
        renderDeckPanel();
        renderMulligan();
    }

    function renderFilterRow() {
        const host = document.getElementById('pdb-filter-row');
        if (!host) return;
        const L = t();
        const chip = (key, value, label, isActive) => `
            <button type="button"
                    class="pdb-chip${isActive ? ' is-active' : ''}"
                    data-filter-key="${escapeHtml(key)}"
                    data-filter-value="${escapeHtml(value)}">
                ${escapeHtml(label)}
            </button>`;
        const segments = [];

        // Meta-format band (radio — single selection).
        const stdLabel = _metaFormatKey
            ? `${L.filterMetaStd} (${_metaFormatKey})`
            : L.filterMetaStd;
        segments.push(`<div class="pdb-chip-group" data-group="meta" aria-label="${escapeHtml(L.filterMeta)}">
            <span class="pdb-chip-label">${escapeHtml(L.filterMeta)}:</span>
            ${chip('meta', 'all',      L.filterMetaAll, _activeFilters.meta === 'all')}
            ${chip('meta', 'standard', stdLabel,        _activeFilters.meta === 'standard')}
            ${chip('meta', 'extended', L.filterMetaExt, _activeFilters.meta === 'extended')}
            ${chip('meta', 'legacy',   L.filterMetaLeg, _activeFilters.meta === 'legacy')}
        </div>`);

        // Type — pokemon + trainer subtypes + energy.
        segments.push(`<div class="pdb-chip-group" data-group="type" aria-label="${escapeHtml(L.filterType)}">
            <span class="pdb-chip-label">${escapeHtml(L.filterType)}:</span>
            ${chip('type', 'pokemon',   L.filterTypePok,  _activeFilters.type.has('pokemon'))}
            ${chip('type', 'supporter', L.filterTypeSup,  _activeFilters.type.has('supporter'))}
            ${chip('type', 'item',      L.filterTypeItm,  _activeFilters.type.has('item'))}
            ${chip('type', 'tool',      L.filterTypeTool, _activeFilters.type.has('tool'))}
            ${chip('type', 'stadium',   L.filterTypeStd,  _activeFilters.type.has('stadium'))}
            ${chip('type', 'energy',    L.filterTypeEne,  _activeFilters.type.has('energy'))}
        </div>`);

        // JP toggle.
        segments.push(`<div class="pdb-chip-group" data-group="jp">
            ${chip('jpInclude', '1', L.filterJp, _activeFilters.jpInclude)}
        </div>`);

        // Set group — collapsible details so 20+ chips don't blow up
        // the layout when nobody touches it.
        const setSelected = _activeFilters.set.size;
        segments.push(`<details class="pdb-set-details" ${setSelected ? 'open' : ''}>
            <summary class="pdb-set-summary">
                <span class="pdb-chip-label">${escapeHtml(L.filterSet)}:</span>
                <span class="pdb-set-counter">${setSelected || L.filterSetNone}</span>
            </summary>
            <div class="pdb-set-controls">
                <input type="text" id="pdb-set-search"
                       class="pdb-set-search-input"
                       placeholder="${escapeHtml(L.filterSetSearch)}"
                       value="${escapeHtml(_setSearchTerm)}"
                       aria-label="${escapeHtml(L.filterSetSearch)}">
            </div>
            <div id="pdb-set-chips" class="pdb-set-chip-list"></div>
        </details>`);

        host.innerHTML = segments.join('');
        host.querySelectorAll('.pdb-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-filter-key');
                const val = btn.getAttribute('data-filter-value');
                if (key === 'meta') {
                    _activeFilters.meta = val;
                } else if (key === 'jpInclude') {
                    _activeFilters.jpInclude = !_activeFilters.jpInclude;
                } else if (key === 'type') {
                    const set = _activeFilters.type;
                    if (set.has(val)) set.delete(val); else set.add(val);
                }
                renderFilterRow();
                renderResults();
            });
        });
        renderSetChips();
        const searchEl = document.getElementById('pdb-set-search');
        if (searchEl) {
            searchEl.addEventListener('input', () => {
                _setSearchTerm = searchEl.value;
                renderSetChips();
            });
        }
    }

    let _setSearchTerm = '';

    function renderSetChips() {
        const host = document.getElementById('pdb-set-chips');
        if (!host) return;
        const term = (_setSearchTerm || '').toUpperCase().trim();
        const sets = (_allSetsList.length ? _allSetsList : [])
            .filter(s => !term || s.includes(term));
        if (sets.length === 0) {
            host.innerHTML = '<p class="pdb-empty pdb-set-empty">—</p>';
            return;
        }
        host.innerHTML = sets.map(s => `
            <button type="button"
                    class="pdb-chip pdb-set-chip${_activeFilters.set.has(s) ? ' is-active' : ''}"
                    data-set-code="${escapeHtml(s)}">${escapeHtml(s)}</button>
        `).join('');
        host.querySelectorAll('.pdb-set-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const code = btn.getAttribute('data-set-code');
                if (_activeFilters.set.has(code)) _activeFilters.set.delete(code);
                else _activeFilters.set.add(code);
                btn.classList.toggle('is-active');
                // Update the counter in the <summary> without a full
                // re-render so the user keeps the details panel open
                // and their search-input focus.
                const counter = document.querySelector('.pdb-set-counter');
                if (counter) {
                    const n = _activeFilters.set.size;
                    counter.textContent = n || t().filterSetNone;
                }
                renderResults();
            });
        });
    }

    function renderResults() {
        const host = document.getElementById('pdb-results');
        if (!host) return;
        const hits = searchResults();
        const countEl = document.getElementById('pdb-result-count');
        if (countEl) countEl.textContent = `${hits.length}${hits.length === MAX_RESULTS ? '+' : ''} ${t().results}`;
        if (hits.length === 0) {
            host.innerHTML = `<p class="pdb-empty">${escapeHtml(t().noResults)}</p>`;
            return;
        }
        host.innerHTML = hits.map(c => renderResultCard(c)).join('');
        const addFromCard = (card) => {
            const key = card.getAttribute('data-card-key');
            const found = _cardIndex.find(c => cardKey(c) === key);
            if (found) {
                addCard(found);
                // Brief visual pulse so the user sees the add register
                // even though their eyes are on the grid, not the deck.
                card.classList.add('is-added');
                setTimeout(() => card.classList.remove('is-added'), 350);
            }
        };
        host.querySelectorAll('.pdb-result-card').forEach(card => {
            card.addEventListener('click', () => addFromCard(card));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addFromCard(card);
                }
            });
        });
    }

    // Database-style mini-card: image on top, compact name + set badge
    // below — matches the Kartendatenbank grid optic the user asked
    // for. The whole tile is the click target; a + overlay appears on
    // hover. Deliberately no card_text / HP / price here — this is a
    // dense picker, not the full database browser.
    function renderResultCard(c) {
        const key = cardKey(c);
        const lang = uiLang();
        const primary = lang === 'de' && c.name_de ? c.name_de : c.name_en;
        const setBadge = `${escapeHtml(c.set || '?')} ${escapeHtml(c.number || '')}`.trim();
        const jp = c.is_japanese ? `<span class="pdb-jp-badge">${escapeHtml(t().jpBadge)}</span>` : '';
        return `
            <div class="pdb-result-card" data-card-key="${escapeHtml(key)}"
                 role="button" tabindex="0"
                 title="${escapeHtml(primary || setBadge)}"
                 aria-label="${escapeHtml(t().addAria(primary || setBadge))}">
                <div class="pdb-result-imgwrap">
                    <img class="pdb-result-img" src="${escapeHtml(c.image_url || '')}"
                         alt="" loading="lazy" onerror="this.closest('.pdb-result-imgwrap').classList.add('pdb-noimg')">
                    <span class="pdb-result-addbadge" aria-hidden="true">＋</span>
                </div>
                <div class="pdb-result-cap">
                    <span class="pdb-result-cap-name">${escapeHtml(primary || '?')}${jp}</span>
                    <span class="pdb-result-cap-set">${setBadge}</span>
                </div>
            </div>`;
    }

    function groupedDeck() {
        const buckets = { pokemon: [], trainer: [], energy: [] };
        for (const c of _deck.cards || []) {
            if (isPokemon(c)) buckets.pokemon.push(c);
            else if (isEnergy(c)) buckets.energy.push(c);
            else if (isTrainer(c)) buckets.trainer.push(c);
            else buckets.trainer.push(c);  // fallback so nothing disappears
        }
        const sortKey = (c) => `${c.energy_type || c.type}|${c.name_en}|${c.set}|${c.number}`;
        buckets.pokemon.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        buckets.trainer.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        buckets.energy.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
        return buckets;
    }

    function renderDeckPanel() {
        const body = document.getElementById('pdb-deck-body');
        const countEl = document.getElementById('pdb-deck-count');
        if (!body || !countEl) return;
        const total = countCards(_deck);
        countEl.textContent = t().cardCount(total);
        if (total === 0) {
            body.innerHTML = `<p class="pdb-empty">${escapeHtml(t().deckEmpty)}</p>`;
            return;
        }
        const L = t();
        const g = groupedDeck();
        const section = (title, cards) => {
            if (!cards.length) return '';
            const total = cards.reduce((s, c) => s + c.count, 0);
            return `
                <div class="pdb-deck-section">
                    <h4 class="pdb-deck-section-h">${escapeHtml(title)} <span class="pdb-deck-section-total">${total}</span></h4>
                    <ul class="pdb-deck-list">${cards.map(renderDeckRow).join('')}</ul>
                </div>`;
        };
        body.innerHTML = section(L.secPokemon, g.pokemon)
                       + section(L.secTrainer, g.trainer)
                       + section(L.secEnergy, g.energy);
        body.querySelectorAll('.pdb-deck-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-card-key');
                removeOne(key);
            });
        });
    }

    function renderDeckRow(c) {
        const key = cardKey(c);
        const lang = uiLang();
        const primary = lang === 'de' && c.name_de ? c.name_de : c.name_en;
        const setBadge = `${c.set || '?'} ${c.number || ''}`.trim();
        const jp = c.is_japanese ? `<span class="pdb-jp-badge">${escapeHtml(t().jpBadge)}</span>` : '';
        return `
            <li class="pdb-deck-row">
                <span class="pdb-deck-row-count">${c.count}×</span>
                <span class="pdb-deck-row-name">${escapeHtml(primary || '?')}${jp}</span>
                <span class="pdb-deck-row-set">${escapeHtml(setBadge)}</span>
                <button type="button" class="pdb-deck-remove"
                        data-card-key="${escapeHtml(key)}"
                        aria-label="${escapeHtml(t().removeAria(primary || setBadge))}"
                        title="−">−</button>
            </li>`;
    }

    function renderMulligan() {
        const body = document.getElementById('pdb-mulligan-body');
        if (!body) return;
        const total = countCards(_deck);
        const basics = countBasics(_deck);
        if (total === 0 || basics === 0) {
            body.innerHTML = `<p class="pdb-empty">${escapeHtml(t().mulliganEmpty)}</p>`;
            return;
        }
        const prob = mulliganProbability(basics, total, HAND_SIZE);
        if (!prob) {
            body.innerHTML = `<p class="pdb-empty">${escapeHtml(t().mulliganEmpty)}</p>`;
            return;
        }
        const fmt = (p) => (p * 100).toFixed(1).replace('.', uiLang() === 'de' ? ',' : '.') + '%';
        const warning = total !== DECK_SIZE
            ? `<p class="pdb-mulligan-warn">${escapeHtml(t().mulliganUnder(total))}</p>`
            : '';
        body.innerHTML = `
            ${warning}
            <div class="pdb-mulligan-grid">
                <div class="pdb-mulligan-cell">
                    <div class="pdb-mulligan-label">${escapeHtml(t().mulliganBasic)}</div>
                    <div class="pdb-mulligan-value pdb-mulligan-good">${fmt(prob.basicInHand)}</div>
                </div>
                <div class="pdb-mulligan-cell">
                    <div class="pdb-mulligan-label">${escapeHtml(t().mulliganMull)}</div>
                    <div class="pdb-mulligan-value pdb-mulligan-bad">${fmt(prob.mulligan)}</div>
                </div>
            </div>
            <p class="pdb-mulligan-note">${escapeHtml(t().mulliganNote(basics, total))}</p>
        `;
    }

    // ── Activation hook ──────────────────────────────────────────────

    async function activate() {
        const host = document.getElementById('profile-deckbuilder');
        if (!host) return;
        host.classList.remove('display-none');
        if (!_initialized) {
            _deck = loadDeck();
            renderRoot();
            // Async: pull JP cards into the index in the background; the
            // initial render uses whatever's in window.allCardsDatabase.
            await buildCardIndex();
            renderResults();
            _initialized = true;
        }
    }

    // Listen for the profile-tab switcher.
    document.addEventListener('DOMContentLoaded', () => {
        // Patch the existing switchProfileTab so 'deckbuilder' lights us up.
        const orig = window.switchProfileTab;
        window.switchProfileTab = function (tabKey) {
            if (typeof orig === 'function') {
                try { orig(tabKey); } catch (_) { /* swallow */ }
            }
            if (tabKey === 'deckbuilder') {
                activate();
            }
        };
        // Re-render on language change so labels follow the toggle.
        document.addEventListener('languageChanged', () => {
            if (_initialized) {
                renderRoot();
            }
        });
    });

    // ── Public API for tests + console debugging ─────────────────────
    window.ProfileDeckBuilder = {
        // Pure helpers (used by unit tests via vm sandbox)
        cardKey,
        isPokemon,
        isTrainer,
        trainerSubtype,
        isEnergy,
        isBasicPokemon,
        isBasicEnergy,
        countCards,
        countBasics,
        mulliganProbability,
        parseDeckList,
        matchesSearch,
        passesFilters,
        // Action surface
        activate,
        getDeck: () => _deck,
        clearDeck,
    };
})();
