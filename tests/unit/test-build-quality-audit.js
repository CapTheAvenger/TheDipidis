/**
 * Unit tests for _buildQualityAudit and the hypergeometric helpers in
 * app-deck-builder.js. The audit surfaces the principles from the
 * "Most Consistency List" doctrine to the user — energy economy,
 * Stadium bump for colorless ability engines, Mega-ex prizing,
 * opening-hand probability, ACE-SPEC prize backup.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    // Same brace-balance extractor used in test-recency-decay.js / test-largest-remainder.js.
    const fnPattern = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = fnPattern.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    if (openIdx < 0) throw new Error(`Missing opening brace for: ${fnName}`);
    let depth = 0;
    let end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        if (depth === 0) { end = i + 1; break; }
    }
    if (end < 0) throw new Error(`Missing closing brace for: ${fnName}`);
    return src.slice(start, end);
}

function loadAuditHelpers() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );
    // The audit helpers reference module-scope const Sets / regex patterns;
    // pull those declarations out by line range so they execute first.
    const constLines = [
        '_COLORLESS_ABILITY_ENGINES', '_MEGA_EX_PATTERN', '_STADIUM_TYPE_PATTERN',
        '_BASIC_POKEMON_PATTERN', '_BASIC_ENERGY_PATTERN', '_SPECIAL_ENERGY_PATTERN',
        '_ENERGY_TYPE_PATTERN',
    ].map(name => {
        const re = new RegExp(`const\\s+${name}\\s*=\\s*[^;]+;`, 's');
        const m = re.exec(src);
        if (!m) throw new Error(`Module-scope const not found: ${name}`);
        return m[0];
    }).join('\n');

    const snippet = [
        constLines,
        extractTopLevel(src, '_binomialChoose'),
        extractTopLevel(src, '_probAtLeastOneInOpening'),
        extractTopLevel(src, '_isBasicPokemonEntry'),
        extractTopLevel(src, '_isEnergyEntry'),
        extractTopLevel(src, '_isStadiumEntry'),
        extractTopLevel(src, '_buildQualityAudit'),
    ].join('\n\n');

    // 29.08.2026: Die Befundtexte kommen jetzt aus der Sprachtabelle
    // statt aus festem Deutsch — sie wurden per textContent ausgegeben
    // und standen damit auch im englischen Modus auf Deutsch. Der Test
    // bekommt deshalb die ECHTE Tabelle, nicht eine Attrappe: so prueft
    // er zusaetzlich, dass jeder benutzte Schluessel wirklich existiert.
    // Eine Attrappe wuerde einen Tippfehler im Schluessel durchlassen.
    const i18nSrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/i18n.js'), 'utf-8');
    const alleZeilen = [...i18nSrc.matchAll(
        /^ {4}'([a-zA-Z0-9._]+)':\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/gm)];
    const bauTabelle = (haelfte) => {
        const mitte = Math.floor(alleZeilen.length / 2);
        const teil = haelfte === 'en' ? alleZeilen.slice(0, mitte) : alleZeilen.slice(mitte);
        const karte = {};
        for (const m of teil) if (karte[m[1]] === undefined) karte[m[1]] = eval(m[2]);
        return karte;
    };
    const tabellen = { de: bauTabelle('de'), en: bauTabelle('en') };
    const benutzt = new Set();
    const macheT = (sprache) => (k) => {
        benutzt.add(k);
        const v = tabellen[sprache][k];
        if (v === undefined) throw new Error('Schluessel fehlt in ' + sprache + ': ' + k);
        return v;
    };

    const baue = (sprache) => {
        const sandbox = { console, Math, Number, String, Array, Set, Object, RegExp, Boolean,
                          t: macheT(sprache) };
        const ctx = vm.createContext(sandbox);
        vm.runInContext(snippet, ctx, { filename: 'audit-extract.js' });
        return sandbox;
    };
    const de = baue('de');
    const en = baue('en');
    return {
        binomialChoose: de._binomialChoose,
        probAtLeastOneInOpening: de._probAtLeastOneInOpening,
        buildQualityAudit: de._buildQualityAudit,
        buildQualityAuditEN: en._buildQualityAudit,
        benutzteSchluessel: benutzt,
        tabellen,
    };
}

const HELPERS = loadAuditHelpers();

const E = (card_name, type, count) => ({
    card: { card_name, type },
    count,
});

function findFinding(audit, key) {
    return audit.findings.find(f => f.key === key);
}

describe('_binomialChoose', () => {
    it('matches the textbook values', () => {
        // C(60,7) = 386206920 — number of distinct 7-card opening hands.
        assert.equal(HELPERS.binomialChoose(60, 7), 386206920);
        // C(53,7) = 154143080 — number of 7-card hands drawable when
        // 7 specific cards are excluded (used in P(≥1 of 7) calc).
        assert.equal(HELPERS.binomialChoose(53, 7), 154143080);
        assert.equal(HELPERS.binomialChoose(0, 0), 1);
        assert.equal(HELPERS.binomialChoose(5, 2), 10);
        assert.equal(HELPERS.binomialChoose(10, 0), 1);
        assert.equal(HELPERS.binomialChoose(10, 10), 1);
    });

    it('returns 0 for impossible inputs', () => {
        assert.equal(HELPERS.binomialChoose(5, 6), 0);
        assert.equal(HELPERS.binomialChoose(5, -1), 0);
    });
});

describe('_probAtLeastOneInOpening', () => {
    it('reproduces the doctrine values for 60-card / 7-hand opening', () => {
        // From the document: 9 basic Pokémon ≈ 70% keep rate, 10 basics ≈ 74%.
        const p9 = HELPERS.probAtLeastOneInOpening(60, 9, 7);
        const p10 = HELPERS.probAtLeastOneInOpening(60, 10, 7);
        const p4 = HELPERS.probAtLeastOneInOpening(60, 4, 7);
        // Expected ranges (some rounding, doctrine quotes 60-80% for 7-11
        // basics and ~40% for 4 copies of the SAME basic Pokémon).
        assert.ok(p9 > 0.68 && p9 < 0.74, `P(≥1 of 9 basics) was ${p9.toFixed(3)}`);
        assert.ok(p10 > 0.72 && p10 < 0.77, `P(≥1 of 10 basics) was ${p10.toFixed(3)}`);
        assert.ok(p4 > 0.36 && p4 < 0.42, `P(≥1 of 4 copies) was ${p4.toFixed(3)}`);
    });

    it('returns 0 when copies is 0', () => {
        assert.equal(HELPERS.probAtLeastOneInOpening(60, 0, 7), 0);
    });

    it('returns 1 when card cannot avoid being drawn', () => {
        // 54 copies in 60 + 7-card hand: at most 6 cards can be non-target
        // from the 6 remaining slots; it's mathematically impossible to
        // open without a copy.
        assert.equal(HELPERS.probAtLeastOneInOpening(60, 54, 7), 1);
    });
});

describe('_buildQualityAudit', () => {
    it('returns no findings for an empty deck', () => {
        // Cross-VM-context arrays don't satisfy deepStrictEqual reference
        // equality (`assert/strict` enforces it), so check the length
        // explicitly instead of comparing array identities.
        const audit = HELPERS.buildQualityAudit([]);
        assert.ok(Array.isArray(audit.findings));
        assert.equal(audit.findings.length, 0);
    });

    it('flags energy economy below 7 as warn', () => {
        const deck = [
            E('Fighting Energy', 'Basic Energy', 4),
            E('Cynthia Gible', 'Basic', 4),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'energy_low');
        assert.ok(f, 'expected energy_low finding');
        assert.equal(f.level, 'warn');
        assert.match(f.message, /4/);
    });

    it('flags energy economy above 11 as warn', () => {
        const deck = [E('Fighting Energy', 'Basic Energy', 12)];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'energy_high');
        assert.ok(f, 'expected energy_high finding');
        assert.equal(f.level, 'warn');
    });

    it('confirms energy economy in the 7–11 corridor as info', () => {
        const deck = [
            E('Fighting Energy', 'Basic Energy', 5),
            E('Rocky Fighting Energy', 'Special Energy', 3),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'energy_ok');
        assert.ok(f);
        assert.equal(f.level, 'info');
        assert.match(f.message, /8/);
    });

    it('warns when colorless ability engines are run without a stadium', () => {
        const deck = [
            E('Drakloak', 'Stage 1', 4),
            E('Dragapult ex', 'Stage 2', 3),
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'stadium_missing');
        assert.ok(f, 'expected stadium_missing finding for Drakloak deck');
        assert.equal(f.level, 'warn');
        assert.match(f.message, /Drakloak/i);
    });

    it('does not warn about stadium bump when one is in the deck', () => {
        const deck = [
            E('Drakloak', 'Stage 1', 4),
            E('Risky Ruins', 'Stadium', 2),
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        assert.equal(findFinding(audit, 'stadium_missing'), undefined);
    });

    it('warns about Mega-ex prizing when Hero\'s Cape is missing', () => {
        const deck = [
            E('Mega Lucario ex', 'Basic', 3),
            E('Riolu', 'Basic', 4),
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'mega_ex_prizing');
        assert.ok(f);
        assert.equal(f.level, 'warn');
        assert.match(f.message, /Mega Lucario ex/);
    });

    it('downgrades Mega-ex prizing to info when Hero\'s Cape is run', () => {
        const deck = [
            E('Mega Lucario ex', 'Basic', 3),
            E("Hero's Cape", 'Item', 1),
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'mega_ex_prizing');
        assert.ok(f);
        assert.equal(f.level, 'info');
    });

    it('reports opening-hand probability correctly', () => {
        // Cynthia-style deck: 4 Gible, 4 Gabite, 3 Garchomp ex, 4 Roselia,
        // 3 Roserade, 1 Spiritomb, 1 Budew = 20 Pokémon, of which only the
        // BASIC ones (Gible, Roselia, Spiritomb, Budew) count = 4+4+1+1 = 10.
        const deck = [
            E('Cynthia\'s Gible', 'Basic', 4),
            E('Cynthia\'s Gabite', 'Stage 1', 4),
            E("Cynthia's Garchomp ex", 'Stage 2', 3),
            E("Cynthia's Roselia", 'Basic', 4),
            E("Cynthia's Roserade", 'Stage 1', 3),
            E("Cynthia's Spiritomb", 'Basic', 1),
            E('Budew', 'Basic', 1),
            // Non-Pokémon to fill the deck — type strings deliberately
            // include "Energy" / "Item" so the basic-Pokémon filter
            // doesn't accidentally count them.
            E('Fighting Energy', 'Basic Energy', 8),
            E("Lillie's Determination", 'Supporter', 4),
            E('Buddy-Buddy Poffin', 'Item', 4),
            E("Boss's Orders", 'Supporter', 3),
            E('Ultra Ball', 'Item', 4),
            E("Poké Pad", 'Item', 4),
            E('Fighting Gong', 'Item', 3),
            E("Cynthia's Power Weight", 'Item', 3),
            E('Hilda', 'Supporter', 2),
            E('Premium Power Pro', 'Item', 2),
            E('Rocky Fighting Energy', 'Special Energy', 3),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'opening_basic_prob');
        assert.ok(f);
        // 10 basics in 60-card deck → ≈74% P(≥1 in 7).
        assert.match(f.message, /\b(7[3-5]|74)%/);
        assert.equal(f.level, 'info');
    });

    it('flags low-basic decks (<50% P) as crit', () => {
        // 5 basic Pokémon in a full 60-card deck → ≈47% P(≥1 in 7)
        // — well below the 50% warn threshold; falls into crit.
        const deck = [
            E('Mega Charizard X ex', 'Basic', 3),
            E('Charmander', 'Basic', 2),
            // Fillers — exact card identities don't matter to the audit
            // beyond ensuring they aren't counted as basic Pokémon.
            E('Charizard ex', 'Stage 2', 4),
            E('Charmeleon', 'Stage 1', 4),
            E("Lillie's Determination", 'Supporter', 4),
            E("Boss's Orders", 'Supporter', 3),
            E('Buddy-Buddy Poffin', 'Item', 4),
            E('Ultra Ball', 'Item', 4),
            E("Poké Pad", 'Item', 4),
            E('Pokégear 3.0', 'Item', 3),
            E('Crispin', 'Supporter', 3),
            E('Hilda', 'Supporter', 2),
            E('Night Stretcher', 'Item', 2),
            E('Switch', 'Item', 2),
            E('Risky Ruins', 'Stadium', 2),
            E('Fire Energy', 'Basic Energy', 9),
            E('Psychic Energy', 'Basic Energy', 5),
        ];
        const totalDeckSize = deck.reduce((s, e) => s + e.count, 0);
        assert.equal(totalDeckSize, 60, 'sanity-check the synthetic deck has 60 cards');
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'opening_basic_prob');
        assert.ok(f);
        assert.equal(f.level, 'crit');
    });

    it('recommends Exchange Ticket when an ACE-SPEC is present', () => {
        const deck = [
            { card: { card_name: 'Neo Upper Energy', type: 'Special Energy', rarity: 'ACE SPEC Rare' }, count: 1 },
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        const f = findFinding(audit, 'exchange_ticket_missing');
        assert.ok(f, 'expected exchange_ticket_missing finding');
        assert.equal(f.level, 'info');
    });

    it('does not recommend Exchange Ticket when one is already in the deck', () => {
        const deck = [
            { card: { card_name: 'Neo Upper Energy', type: 'Special Energy', rarity: 'ACE SPEC Rare' }, count: 1 },
            E('Exchange Ticket', 'Item', 1),
            E('Fighting Energy', 'Basic Energy', 8),
        ];
        const audit = HELPERS.buildQualityAudit(deck);
        assert.equal(findFinding(audit, 'exchange_ticket_missing'), undefined);
    });
});

describe('Das Build-Quality-Audit spricht die Sprache des Nutzers', () => {
    // Am 29.08.2026 im angemeldeten Konto belegt: die Ueberschrift des
    // Audits war uebersetzt, die sieben Befunde darunter standen fest
    // auf Deutsch. Sie gehen per textContent auf den Bildschirm, also
    // ungefiltert — im englischen Modus las man eine englische
    // Ueberschrift ueber deutschen Saetzen.
    const deck = [
        E('Pikachu ex', 'Pokémon', 4),
        E('Basic Fire Energy', 'Energy', 4),
    ];

    it('derselbe Befund kommt in beiden Sprachen unterschiedlich heraus', () => {
        const de = HELPERS.buildQualityAudit(deck, 60);
        const en = HELPERS.buildQualityAuditEN(deck, 60);
        assert.equal(de.findings.length, en.findings.length,
            'die Sprache darf die ANZAHL der Befunde nicht veraendern');
        assert.ok(de.findings.length > 0, 'kein Befund erzeugt — Testdeck taugt nicht');
        let verschieden = 0;
        for (let i = 0; i < de.findings.length; i++) {
            assert.equal(de.findings[i].key, en.findings[i].key,
                'die Reihenfolge der Befunde haengt an der Sprache');
            assert.equal(de.findings[i].level, en.findings[i].level,
                'die Einstufung haengt an der Sprache');
            if (de.findings[i].message !== en.findings[i].message) verschieden++;
        }
        assert.ok(verschieden > 0,
            'kein einziger Befundtext unterscheidet sich — die Texte haengen '
            + 'wieder fest im Code statt in der Sprachtabelle');
    });

    it('im englischen Modus steht in keinem Befund ein deutsches Wort', () => {
        const en = HELPERS.buildQualityAuditEN(deck, 60);
        // "Deck", "Decks", "Karte" sind Szenesprache und stehen auch im
        // englischen Text richtig — sie duerfen hier nicht anschlagen.
        // Geprueft wird auf Woerter, die es im Englischen nicht gibt.
        const DEUTSCH = /[äöüÄÖÜß]|\b(?:und|oder|nicht|kein|keine|einer|einem|Energien|ohne|unter|ueber|Starthand|Preiskarten|Gegner|erlaubt|verschenkt|erhoeht|schuetzt|liegt|sobald|verbleibenden|feststecken|zwingend|Faehigkeiten)\b/;
        for (const f of en.findings) {
            assert.ok(!DEUTSCH.test(f.message),
                `deutsches Wort im englischen Befund ${f.key}: ${f.message}`);
            if (f.hint) {
                assert.ok(!DEUTSCH.test(f.hint),
                    `deutsches Wort im englischen Hinweis ${f.key}: ${f.hint}`);
            }
        }
    });

    it('kein Befund zeigt einen rohen Schluessel statt eines Textes', () => {
        for (const audit of [HELPERS.buildQualityAudit(deck, 60), HELPERS.buildQualityAuditEN(deck, 60)]) {
            for (const f of audit.findings) {
                assert.ok(!/^audit\.[a-zA-Z]/.test(f.message), 'roher Schluessel: ' + f.message);
                assert.ok(!/\{(n|pct|name|names)\}/.test(f.message),
                    'nicht ersetzter Platzhalter: ' + f.message);
            }
        }
    });

    it('jeder benutzte Schluessel steht in beiden Sprachen', () => {
        // benutzteSchluessel wird beim Laden gefuellt; die Ausfuehrung
        // oben hat alle Zweige beruehrt, die dieses Deck ausloest.
        HELPERS.buildQualityAudit(deck, 60);
        assert.ok(HELPERS.benutzteSchluessel.size > 0, 'kein Schluessel benutzt');
        for (const k of HELPERS.benutzteSchluessel) {
            assert.notEqual(HELPERS.tabellen.de[k], undefined, 'fehlt auf Deutsch: ' + k);
            assert.notEqual(HELPERS.tabellen.en[k], undefined, 'fehlt auf Englisch: ' + k);
        }
    });
});
