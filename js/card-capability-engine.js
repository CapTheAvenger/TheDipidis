// Card-Capability Engine
//
// Extracts capability tags from card rules text (abilities + attacks),
// matches user-deck attacker tags against opponent-archetype defender
// tags, and returns detected tech-counter matchups with confidence
// levels and narrative strings.
//
// Data inputs (all loaded lazily via fetch):
//   data/card_capability_taxonomy.json    — tag definitions
//   data/card_capability_patterns.json    — regex extractors per tag
//   data/card_capability_interactions.json — attacker-vs-defender rules
//   data/pokemon_card_effects.json        — card rules text (already
//                                            loaded by deck-builder)
//
// Public surface (attached to window.CardCapabilityEngine):
//   load()                       — preload all data, idempotent
//   extractTags(cardEffectsRec)  — for a single card record, return
//                                  Array<{tag, confidence, source}>
//   detectMatchups({userCardIds, opponentArchetypes,
//                   archetypeCardMap})
//                                — main entry point: return per-opponent
//                                  detected tech matchups with narrative
//
// All regex compilation is cached on the engine instance, all
// per-card tag extraction results are cached by SET|number so the
// engine is cheap to re-invoke when the user edits the deck.

(function () {
    'use strict';

    let _data = null;
    let _dataPromise = null;
    const _tagsByCard = new Map(); // SET|number → Array<TagHit>

    async function _fetchJSON(path) {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
        return resp.json();
    }

    function _compilePatterns(patternFile) {
        // Compile each regex once. A pattern with a bad regex is
        // dropped (and logged) rather than crashing the whole engine.
        const compiled = [];
        for (const p of (patternFile.patterns || [])) {
            try {
                const flags = p.flags || '';
                compiled.push({
                    tag:        p.tag,
                    confidence: p.confidence || 'medium',
                    scope:      p.scope,
                    regex:      new RegExp(p.regex, flags),
                });
            } catch (e) {
                if (typeof console !== 'undefined') {
                    console.warn('[CardCapabilityEngine] bad regex', p.tag, p.regex, e.message);
                }
            }
        }
        return compiled;
    }

    async function load() {
        if (_data) return _data;
        if (_dataPromise) return _dataPromise;
        _dataPromise = (async () => {
            try {
                const [taxonomy, patterns, interactions] = await Promise.all([
                    _fetchJSON('./data/card_capability_taxonomy.json'),
                    _fetchJSON('./data/card_capability_patterns.json'),
                    _fetchJSON('./data/card_capability_interactions.json'),
                ]);
                _data = {
                    taxonomy,
                    patterns:     _compilePatterns(patterns),
                    interactions: interactions.interactions || [],
                };
                return _data;
            } catch (e) {
                if (typeof console !== 'undefined') {
                    console.warn('[CardCapabilityEngine] load failed:', e.message);
                }
                _data = { taxonomy: {tags:{}}, patterns: [], interactions: [] };
                return _data;
            }
        })();
        return _dataPromise;
    }

    function _textBuckets(rec) {
        // Group card text by scope so each pattern only runs on the
        // text it's meant for. attack.text / ability.text patterns
        // get their respective arrays; card_text patterns get
        // everything concatenated (used for catch-all rules text on
        // supporters/items).
        const attackTexts  = [];
        const abilityTexts = [];
        const allText      = [];
        if (Array.isArray(rec.attacks)) {
            for (const a of rec.attacks) {
                const t = String(a.text || '');
                if (t) { attackTexts.push({ name: a.name, text: t }); allText.push(t); }
            }
        }
        if (Array.isArray(rec.abilities)) {
            for (const ab of rec.abilities) {
                const t = String(ab.text || '');
                if (t) { abilityTexts.push({ name: ab.name, text: t }); allText.push(t); }
            }
        }
        if (Array.isArray(rec.rules)) {
            for (const r of rec.rules) {
                const t = String(r || '');
                if (t) allText.push(t);
            }
        }
        return { attackTexts, abilityTexts, allText: allText.join(' ') };
    }

    function extractTags(rec, setNumberKey) {
        if (!rec) return [];
        if (setNumberKey && _tagsByCard.has(setNumberKey)) {
            return _tagsByCard.get(setNumberKey);
        }
        if (!_data) return [];
        const buckets = _textBuckets(rec);
        const hits = [];
        for (const p of _data.patterns) {
            const scope = p.scope;
            if (scope === 'attack.text') {
                for (const a of buckets.attackTexts) {
                    if (p.regex.test(a.text)) {
                        hits.push({ tag: p.tag, confidence: p.confidence, source: { type: 'attack', name: a.name } });
                    }
                }
            } else if (scope === 'ability.text') {
                for (const ab of buckets.abilityTexts) {
                    if (p.regex.test(ab.text)) {
                        hits.push({ tag: p.tag, confidence: p.confidence, source: { type: 'ability', name: ab.name } });
                    }
                }
            } else if (scope === 'card_text') {
                if (p.regex.test(buckets.allText)) {
                    hits.push({ tag: p.tag, confidence: p.confidence, source: { type: 'card', name: rec.name } });
                }
            }
        }
        // De-dupe: same tag from same source counted once. Keep the
        // highest-confidence variant if multiple patterns produced it.
        const seen = new Map();
        for (const h of hits) {
            const k = `${h.tag}|${h.source.type}|${h.source.name}`;
            const prev = seen.get(k);
            if (!prev || _confidenceRank(h.confidence) > _confidenceRank(prev.confidence)) {
                seen.set(k, h);
            }
        }
        const out = Array.from(seen.values());
        if (setNumberKey) _tagsByCard.set(setNumberKey, out);
        return out;
    }

    function _confidenceRank(c) {
        return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
    }

    function _lookupCardRecord(cardEffectsIndex, cardKey, cardName) {
        // Try SET|number key first, then case-insensitive name match.
        // cardEffectsIndex shape: { bySetNumber: Map, byName: Map }
        // Note: app-meta-call's _loadCardEffectsForHp builds a partial
        // index with only byName (no bySetNumber). When MetaCall ran
        // first this session, window._cardEffectsIndex points at that
        // partial shape — fall back to byName instead of throwing.
        if (!cardEffectsIndex) return null;
        if (cardKey && cardEffectsIndex.bySetNumber) {
            const rec = cardEffectsIndex.bySetNumber.get(String(cardKey).toUpperCase().trim());
            if (rec) return rec;
        }
        if (cardName && cardEffectsIndex.byName) {
            const rec = cardEffectsIndex.byName.get(String(cardName).toLowerCase().trim());
            if (rec) return rec;
        }
        return null;
    }

    function _collectDeckTags(deckCardKeys, cardEffectsIndex) {
        // deckCardKeys: Array<{ key: "SET|number", name: "Card Name" }>
        // Returns Map<tag, Array<{cardKey, cardName, confidence, source}>>
        const out = new Map();
        for (const c of deckCardKeys) {
            const rec = _lookupCardRecord(cardEffectsIndex, c.key, c.name);
            if (!rec) continue;
            const tags = extractTags(rec, c.key);
            for (const t of tags) {
                if (!out.has(t.tag)) out.set(t.tag, []);
                out.get(t.tag).push({
                    cardKey:    c.key,
                    cardName:   rec.name,
                    confidence: t.confidence,
                    source:     t.source,
                });
            }
        }
        return out;
    }

    function _narrative(interaction, lang, attacker, defender) {
        const tpl = (lang === 'de'
            ? (interaction.narrative_de || interaction.narrative_en)
            : interaction.narrative_en) || '';
        return tpl
            .replace('{attacker_name}',     attacker.cardName)
            .replace('{attacker_source}',   attacker.source.name)
            .replace('{defender_name}',     defender.cardName)
            .replace('{defender_ability}',  defender.source.name);
    }

    async function detectMatchups(opts) {
        // opts: { userDeckCards: Array<{key,name}>,
        //         archetypeCardMap: Map<archName, Array<{key,name}>>,
        //         cardEffectsIndex,
        //         lang: 'en'|'de' }
        // Returns Map<archName, Array<DetectedMatchup>> where
        // DetectedMatchup = { attackerCard, attackerSource, defenderCard,
        //                     defenderSource, confidence, matchupValue,
        //                     narrative }
        await load();
        if (!_data || !_data.interactions.length) return new Map();
        const userTags = _collectDeckTags(opts.userDeckCards || [], opts.cardEffectsIndex);
        const out = new Map();
        if (userTags.size === 0) return out;
        const lang = opts.lang || 'en';

        for (const [archName, oppCards] of opts.archetypeCardMap || []) {
            const detected = [];
            for (const ix of _data.interactions) {
                const userMatches = userTags.get(ix.attacker);
                if (!userMatches || !userMatches.length) continue;
                for (const oppCard of oppCards) {
                    const oppRec = _lookupCardRecord(opts.cardEffectsIndex, oppCard.key, oppCard.name);
                    if (!oppRec) continue;
                    const oppTags = extractTags(oppRec, oppCard.key);
                    for (const ot of oppTags) {
                        if (ot.tag !== ix.defender) continue;
                        for (const um of userMatches) {
                            const combinedConf = _minConfidence(um.confidence, ot.confidence, ix.confidence);
                            detected.push({
                                attackerCard:   um.cardName,
                                attackerSource: um.source,
                                defenderCard:   oppRec.name,
                                defenderSource: ot.source,
                                confidence:     combinedConf,
                                matchupValue:   ix.matchup_value || 0,
                                interactionTag: `${ix.attacker}→${ix.defender}`,
                                narrative:      _narrative(ix, lang,
                                    { cardName: um.cardName,  source: um.source },
                                    { cardName: oppRec.name,  source: ot.source }),
                            });
                        }
                    }
                }
            }
            if (detected.length) {
                // De-dupe identical attacker/defender/interaction tuples
                // — opponents often have multiple prints of the same
                // card and we don't want to list the same matchup 3×.
                const seen = new Set();
                const unique = [];
                for (const d of detected) {
                    const k = `${d.attackerCard}|${d.defenderCard}|${d.interactionTag}`;
                    if (seen.has(k)) continue;
                    seen.add(k);
                    unique.push(d);
                }
                out.set(archName, unique);
            }
        }
        return out;
    }

    function _minConfidence(a, b, c) {
        const r = Math.min(_confidenceRank(a), _confidenceRank(b), _confidenceRank(c || 'high'));
        return r === 3 ? 'high' : r === 2 ? 'medium' : 'low';
    }

    window.CardCapabilityEngine = {
        load,
        extractTags,
        detectMatchups,
    };
})();
