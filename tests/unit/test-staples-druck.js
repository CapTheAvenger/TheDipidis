/**
 * Format-Staples: der Druck-Umschalter.
 *
 * Gemeldet am 28.08.2026: "wenn ich im Meta Staple die rarity wechseln
 * will kommt ein fehler". Der Schalter suchte ein Deck, das es an dieser
 * Stelle nie gab, und meldete "Diese Karte wurde im aktuellen Deck nicht
 * gefunden". Dazu der Wunsch: "fuer die Meta Staples wuerde ich gerne 1
 * Post machen mit low rarity und high rarity".
 *
 * Zwei Dinge muessen dafuer stimmen und werden hier festgehalten:
 *
 *  1. Der Stern im Widget oeffnet den Schalter im ANZEIGE-Modus — sonst
 *     laeuft er wieder in die Deck-Suche.
 *  2. Die Druckwahl leiht sich die globale Seltenheits-Vorliebe und gibt
 *     sie zurueck, AUCH wenn der Aufloeser mittendrin wirft. Ohne das
 *     bliebe sie auf 'max' stehen und wuerde still den Deckbau umstellen.
 *
 * renderTopCardsWidget und staplesDruckFuer werden woertlich aus der
 * Quelle geschnitten und mit Attrappen ausgefuehrt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-tier-meta.js'), 'utf8');

function schneide(kopf, bis) {
    const a = SRC.indexOf(kopf);
    const b = SRC.indexOf(bis, a);
    assert.ok(a > -1 && b > a, `Schnitt fehlgeschlagen: ${kopf}`);
    return SRC.slice(a, b);
}

// ── 1) Das Markup des Widgets ────────────────────────────────────────
const WIDGET = schneide('function renderTopCardsWidget(topCards)',
                        '/**\n         * Render and inject Top Cards Widget');

function bauWidget(lang, modus) {
    const attrappen = {
        t: (k) => ({
            'tier.mostUsedCards': 'Meistgespielte Karten',
            'staples.printPlayed': 'Gespielter Druck',
            'cl.rarityLow': 'Niedrige Seltenheit',
            'cl.rarityMax': 'Max. Seltenheit',
            'staples.printHint': 'Seltenheit aendert nur das Bild, nie die Zahlen.',
            'mc.generateImage': 'Bild generieren',
        }[k] || k),
        getLang: () => lang,
        fmtPct: (v) => String(v) + '%',
        escapeHtml: (s) => String(s == null ? '' : s),
        escapeJsStr: (s) => String(s == null ? '' : s),
        STAPLES_ANZAHL: 15,
        ladeStaplesModus: () => modus || 'gespielt',
    };
    const fabrik = new Function(...Object.keys(attrappen),
        WIDGET + '\nreturn renderTopCardsWidget;');
    return fabrik(...Object.values(attrappen));
}

function karten() {
    const arr = [
        { name: 'Night Stretcher', global_share: 100.0, deck_inclusion_count: 60, set_code: 'ASC', set_number: '196' },
        { name: 'Ultra Ball', global_share: 98.3, deck_inclusion_count: 59, set_code: 'MEG', set_number: '131' },
    ];
    arr.totalArchetypes = 60;
    return arr;
}

describe('Format-Staples: der Stern oeffnet den Anzeige-Modus', () => {
    it('uebergibt "staples" als viertes Argument', () => {
        const html = bauWidget('de')(karten());
        // Ohne dieses vierte Argument sucht der Schalter ein Deck und
        // meldet "Diese Karte wurde im aktuellen Deck nicht gefunden".
        assert.match(html, /openRaritySwitcherFromDB\('Night Stretcher', 'ASC', '196', 'staples'\)/);
    });

    it('bietet die drei Druck-Knoepfe und den Bild-Knopf an', () => {
        const html = bauWidget('de')(karten());
        assert.match(html, /id="staplesDruck-gespielt"/);
        assert.match(html, /id="staplesDruck-min"/);
        assert.match(html, /id="staplesDruck-max"/);
        assert.match(html, /staplesBildErzeugen\(\)/);
    });

    it('sagt dazu, dass die Seltenheit keine Zahl bewegt', () => {
        // Der Bildwechsel steht direkt ueber einer Prozentzahl. Ohne den
        // Satz liest sich das, als haette sich die Zahl geaendert.
        const html = bauWidget('de')(karten());
        assert.match(html, /nie die Zahlen/);
    });

    it('markiert genau den gemerkten Modus als aktiv', () => {
        const html = bauWidget('de', 'max')(karten());
        assert.match(html, /class="btn-toggle-item active" id="staplesDruck-max"/);
        assert.ok(!/class="btn-toggle-item active" id="staplesDruck-min"/.test(html));
        assert.match(html, /id="staplesDruck-max"[^>]*aria-pressed="true"/);
    });
});

describe('Format-Staples: die Rangziffer bleibt lesbar', () => {
    const LES = schneide('function lesbareSchrift(hintergrund)', 'async function renderCurrentMetaTopCards');
    const lesbareSchrift = new Function(LES + '\nreturn lesbareSchrift;')();

    it('setzt auf Gold dunkle statt weisser Ziffern', () => {
        // Gemessen 28.08.2026: weiss auf #f39c12 sind 2,2:1.
        assert.equal(lesbareSchrift('#f39c12'), '#10151f');
        assert.equal(lesbareSchrift('#95a5a6'), '#10151f');
    });

    it('setzt auf dunklem Grund weisse Ziffern', () => {
        assert.equal(lesbareSchrift('#1a2640'), '#ffffff');
    });

    it('faellt bei unbrauchbarer Farbe auf Weiss zurueck', () => {
        assert.equal(lesbareSchrift(''), '#ffffff');
        assert.equal(lesbareSchrift('rgb(1,2,3)'), '#ffffff');
    });
});

// ── 2) Die Druckwahl ─────────────────────────────────────────────────
const WAHL = schneide('function staplesDruckFuer(card, modus)', '\n        function staplesListe(');

function bauWahl(opts) {
    const zustand = { globalRarityPreference: 'min' };
    const attrappen = {
        window: opts.window || {},
        getPreferredVersionForCard: opts.aufloeser || (() => null),
        getUnifiedCardImage: opts.bild || ((s, n) => `bild/${s}-${n}.png`),
        console: { warn: () => {} },
    };
    const fabrik = new Function(...Object.keys(attrappen),
        'let globalRarityPreference = "min";' +
        WAHL +
        '\nreturn { fn: staplesDruckFuer, pref: () => globalRarityPreference };');
    return fabrik(...Object.values(attrappen));
}

const KARTE = { name: 'Ultra Ball', set_code: 'MEG', set_number: '131', image_url: 'bild/MEG-131.png' };

describe('Format-Staples: die Druckwahl', () => {
    it('gibt im Modus "gespielt" den Druck aus der Deckliste zurueck', () => {
        const w = bauWahl({ aufloeser: () => { throw new Error('darf nicht gefragt werden'); } });
        assert.deepEqual(w.fn(KARTE, 'gespielt'), { set: 'MEG', number: '131', url: 'bild/MEG-131.png' });
    });

    it('nimmt bei "max" den Druck, den der Aufloeser der Seite nennt', () => {
        const w = bauWahl({ aufloeser: () => ({ set: 'PLF', number: '122' }) });
        assert.deepEqual(w.fn(KARTE, 'max'), { set: 'PLF', number: '122', url: 'bild/PLF-122.png' });
    });

    it('gibt die geliehene globale Vorliebe zurueck', () => {
        const w = bauWahl({ aufloeser: () => ({ set: 'PLF', number: '122' }) });
        w.fn(KARTE, 'max');
        assert.equal(w.pref(), 'min');
    });

    it('gibt sie auch zurueck, wenn der Aufloeser wirft', () => {
        // Ohne finally bliebe die Vorliebe auf 'max' stehen — und damit
        // saehe der Deckbau der ganzen Seite anders aus als vorher.
        const w = bauWahl({ aufloeser: () => { throw new Error('kaputt'); } });
        const d = w.fn(KARTE, 'max');
        assert.equal(w.pref(), 'min');
        assert.equal(d.set, 'MEG');
    });

    it('laesst das von Hand gewaehlte Artwork den Modus stechen', () => {
        const w = bauWahl({
            window: { anzeigeDruckFuer: () => ({ set: 'SSP', number: '251' }) },
            aufloeser: () => ({ set: 'PLF', number: '122' }),
        });
        assert.deepEqual(w.fn(KARTE, 'max'), { set: 'SSP', number: '251', url: 'bild/SSP-251.png' });
    });

    it('bleibt beim gespielten Druck, wenn Set oder Nummer fehlen', () => {
        const w = bauWahl({ aufloeser: () => ({ set: 'PLF', number: '122' }) });
        const ohne = { name: 'Ultra Ball', set_code: '', set_number: '', image_url: 'x.png' };
        assert.deepEqual(w.fn(ohne, 'max'), { set: '', number: '', url: 'x.png' });
    });
});
