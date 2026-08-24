/**
 * Vier Meldungen des Betreibers vom 24.08.2026, alle in einer Datei:
 *
 *  1. "Sortierung nach Kartenart sortiert nicht in der korrekten Reihenfolge."
 *     Sie sortierte alphabetisch nach dem INTERNEN Typnamen: ACE SPEC, Basic
 *     Energy, Item, Pokemon-Colorless, Pokemon-Darkness, ... Supporter, Tool.
 *     Richtig ist die Reihenfolge des Filters darueber: erst die Pokémon nach
 *     Element, dann Unterstuetzer, Item, Tool, Stadium, Energien, ACE SPEC.
 *
 *  2. "Werkzeug ist auch in Deutsch Tool." Die Kartenart heisst in der
 *     deutschen Community Tool. Der Menuepunkt "Werkzeuge" bleibt, der meint
 *     Programme und nicht Karten.
 *
 *  3. Die Drucke einer Karte standen untereinander statt nebeneinander. Die
 *     Gruppe war ein Gitterfeld von 110 px Breite — ein Flex-Umbruch in einer
 *     110-px-Spalte ist eine Spalte.
 *
 *  4. "Armarouge PBL 12 fehlt im Standard-Druck." Die Zusammenfassung lief
 *     ueber den Kartennamen. PBL 12 (Flame Legion) und SSP 34 (Crimson
 *     Blaster) sind aber verschiedene Karten, kein Nachdruck voneinander.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CB = fs.readFileSync(path.join(ROOT, 'js', 'custom-binder.js'), 'utf8');
/** Kommentare raus, bevor irgendein Test nach Code sucht. Diese Datei ist
 *  schon einmal ueber ihren eigenen Erklaertext gestolpert: der Kommentar,
 *  der den alten Vergleich beschreibt, enthaelt den alten Vergleich. */
const ohneKommentar = s => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
const DB = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

// ── 1. Kartenart-Sortierung ──────────────────────────────────────────

describe('Custom Binder: die Kartenart sortiert in der Reihenfolge des Filters', () => {
    /** Die Werte der Auswahlliste "Alle Typen", in ihrer Reihenfolge. */
    function filterReihenfolge() {
        const start = CB.indexOf('id="cbFilterType"');
        assert.ok(start > 0, 'die Typ-Auswahlliste steht nicht mehr in custom-binder.js');
        const ende = CB.indexOf('</select>', start);
        const block = CB.slice(start, ende);
        return [...block.matchAll(/<option value="([^"]+)"/g)]
            .map(m => m[1])
            .filter(v => v !== 'all');
    }

    /** Die Rangliste, nach der cbTypRang sortiert. */
    function sortierReihenfolge() {
        const m = CB.match(/const CB_TYP_REIHENFOLGE = \[([\s\S]*?)\];/);
        assert.ok(m, 'CB_TYP_REIHENFOLGE fehlt');
        return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
    }

    it('Filter und Sortierung nennen dieselben Arten in derselben Reihenfolge', () => {
        // Wenn diese beiden auseinanderlaufen, sortiert der Ordner anders als
        // die Liste, aus der der Betreiber die Art auswaehlt.
        assert.deepEqual(sortierReihenfolge(), filterReihenfolge());
    });

    it('Pokémon stehen vor den Trainerkarten, Energien dahinter', () => {
        const r = sortierReihenfolge();
        const pos = t => r.indexOf(t);
        assert.ok(pos('Pokemon-Colorless') < pos('Supporter'),
            'die Pokémon stehen nicht vor den Unterstuetzern');
        assert.ok(pos('Supporter') < pos('Item'), 'Unterstuetzer stehen nicht vor Item');
        assert.ok(pos('Item') < pos('Tool'), 'Item steht nicht vor Tool');
        assert.ok(pos('Tool') < pos('Stadium'), 'Tool steht nicht vor Stadium');
        assert.ok(pos('Stadium') < pos('Special Energy'), 'Stadium steht nicht vor den Energien');
        assert.ok(pos('Special Energy') < pos('Basic Energy'),
            'Spezial-Energie steht nicht vor Basis-Energie');
    });

    it('die Elemente stehen in der Reihenfolge der Karten, nicht im Alphabet', () => {
        const r = sortierReihenfolge().filter(t => t.startsWith('Pokemon-'));
        assert.deepEqual(r, [
            'Pokemon-Grass', 'Pokemon-Fire', 'Pokemon-Water', 'Pokemon-Lightning',
            'Pokemon-Psychic', 'Pokemon-Fighting', 'Pokemon-Darkness', 'Pokemon-Metal',
            'Pokemon-Dragon', 'Pokemon-Colorless'
        ]);
        // Alphabetisch waere Colorless zuerst — genau der Zustand, den der
        // Betreiber gemeldet hat.
        assert.notEqual(r[0], 'Pokemon-Colorless');
    });

    it('die Sortierung vergleicht Raenge, nicht Typnamen', () => {
        const code = ohneKommentar(CB);
        const start = code.indexOf("if (cbSort === 'typ')");
        const block = code.slice(start, start + 600);
        assert.match(block, /cbTypRang\(shared, a\)/, 'cbTypRang wird nicht benutzt');
        assert.ok(!/ta\.localeCompare\(tb\)/.test(block),
            'der alphabetische Vergleich der Typnamen ist wieder da');
    });

    it('eine unbekannte Art landet hinten und nicht mittendrin', () => {
        const m = CB.match(/function cbTypRang\(shared, karte\) \{[\s\S]*?\n    \}/);
        assert.ok(m, 'cbTypRang fehlt');
        assert.match(m[0], /rang === -1 \? CB_TYP_REIHENFOLGE\.length : rang/,
            'unbekannte Arten bekommen keinen Rang am Ende');
    });
});

// ── 2. Werkzeug heisst Tool ──────────────────────────────────────────

describe('Die Kartenart heisst auch auf Deutsch Tool', () => {
    const kartenSchluessel = [
        'cardType.tool', 'cl.typeTool', 'profile.filterTool', 'filter.typeTool'
    ];

    for (const key of kartenSchluessel) {
        it(`${key} sagt Tool, nicht Werkzeug`, () => {
            const m = I18N.match(new RegExp(`'${key.replace('.', '\\.')}':\\s*'([^']*)'`, 'g'));
            assert.ok(m && m.length >= 2, `${key} fehlt in einem der beiden Sprachbloecke`);
            // Der deutsche Block steht hinter dem englischen.
            const deutsch = m[m.length - 1];
            assert.ok(!/Werkzeug/.test(deutsch), `${key} steht noch auf Werkzeug: ${deutsch}`);
            assert.match(deutsch, /Tool/, `${key} nennt Tool nicht`);
        });
    }

    it('die Kategorie in der Kartendatenbank heisst Pokémon-Tool', () => {
        assert.match(I18N, /'cdb\.catTool':\s*'Pokémon-Tool'/,
            'cdb.catTool steht noch auf Pokémon-Werkzeug');
    });

    it('der Menuepunkt fuer Programme bleibt Werkzeuge', () => {
        // Bewusst NICHT umbenannt: dort stehen der Playtester und andere
        // Programme, keine Karten. Ein "Tools"-Menue neben der Kartenart Tool
        // waere genau die Verwechslung, die wir vermeiden wollen.
        assert.match(I18N, /'menu\.toolsGroup':\s*'Werkzeuge'/,
            'der Menuepunkt wurde mit umbenannt — das war nicht gemeint');
    });
});

// ── 3. Drucke nebeneinander ──────────────────────────────────────────

describe('Custom Binder: die Drucke einer Karte liegen nebeneinander', () => {
    it('die Druckgruppe nimmt die ganze Gitterbreite', () => {
        const m = CB.match(/\.cb-print-group\{([^}]*)\}/);
        assert.ok(m, 'die Regel .cb-print-group fehlt');
        assert.match(m[1], /grid-column:1\/-1/,
            'ohne grid-column steht die Gruppe in einer 110-px-Spalte und die Drucke stapeln sich');
        assert.match(m[1], /display:flex/, 'die Gruppe ist keine Reihe mehr');
        assert.match(m[1], /flex-wrap:wrap/, 'ohne Umbruch laufen viele Drucke aus dem Bild');
    });

    it('die Karten in der Gruppe haben eine feste Breite', () => {
        // Ohne feste Breite zieht flex die Karten auf die volle Zeilenbreite
        // auseinander — dann sind es zwei riesige Karten statt acht kleinen.
        const m = CB.match(/\.cb-print-group \.meta-binder-card\{([^}]*)\}/);
        assert.ok(m, 'die Kartenregel in der Gruppe fehlt');
        assert.match(m[1], /flex:0 0 110px/, 'die Karten haben keine feste Breite');
    });
});

// ── 4. Standard-Druck fasst nur Nachdrucke zusammen ──────────────────

describe('Kartendatenbank: der Standard-Druck fasst Nachdrucke zusammen, nicht Namen', () => {
    it('es gibt einen Schluessel fuer die Druckfamilie', () => {
        assert.match(DB, /function cardPrintFamilyKey\(card\)/,
            'cardPrintFamilyKey fehlt');
        const m = DB.match(/function cardPrintFamilyKey\(card\) \{[\s\S]*?\n        \}/);
        assert.match(m[0], /international_prints/,
            'der Schluessel liest die Druckfamilie nicht');
    });

    it('ohne Familienangabe steht die Karte fuer sich', () => {
        // Ein leeres Feld darf nicht dazu fuehren, dass alle Karten ohne
        // Angabe zu einem Eintrag verschmelzen.
        const m = DB.match(/function cardPrintFamilyKey\(card\) \{[\s\S]*?\n        \}/);
        assert.match(m[0], /card\.set[\s\S]*card\.number/,
            'der Rueckfall benutzt nicht Set und Nummer');
    });

    it('gruppiert wird nach Name UND Familie', () => {
        assert.match(DB, /const key = cardName \+ '\|' \+ cardPrintFamilyKey\(card\)/,
            'die Gruppierung laeuft nicht ueber die Familie');
    });

    it('nicht mehr nach dem blossen Namen', () => {
        const code = ohneKommentar(DB);
        const start = code.indexOf('function deduplicateCardsForDisplay');
        const block = code.slice(start, start + 1200);
        assert.ok(!/cardsByName\.set\(cardName,/.test(block),
            'die Zusammenfassung laeuft wieder ueber den Namen allein');
    });

    it('die niedrigste Seltenheit gewinnt weiterhin innerhalb der Familie', () => {
        // Der Betreiber hat das ausdruecklich so gewollt: "dann soll immer der
        // aktuellste low rarity Print genutzt werden" — aber eben nur unter
        // echten Nachdrucken.
        assert.match(DB, /const minRarityRank = Math\.min\(\.\.\.prints\.map\(p => getBudgetRarityRank\(p\.rarity\)\)\)/,
            'die Seltenheitsregel ist verschwunden');
    });
});

// ── 4b. Die Daten tragen die Annahme ─────────────────────────────────

describe('Die Druckfamilien in den Daten sind belastbar', () => {
    const daten = fs.readdirSync(path.join(ROOT, 'data'))
        .filter(f => /^cards_chunk_.*\.json$/.test(f))
        .flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')));

    const familie = k => String(k.international_prints || '')
        .split(',').map(t => t.trim().toUpperCase()).filter(Boolean).sort().join(',');

    it('jede Karte kennt ihre Familie und steht selbst darin', () => {
        const ohne = daten.filter(k => !familie(k));
        assert.equal(ohne.length, 0, `${ohne.length} Karten ohne international_prints`);
        const fehlend = daten.filter(k => {
            const eigen = `${String(k.set || '').toUpperCase()}-${String(k.number || '').toUpperCase()}`;
            return !familie(k).split(',').includes(eigen);
        });
        assert.equal(fehlend.length, 0,
            `${fehlend.length} Karten stehen nicht in ihrer eigenen Familie`);
    });

    it('keine Familie spannt zwei Kartennamen', () => {
        const namen = new Map();
        daten.forEach(k => {
            const f = familie(k);
            if (!namen.has(f)) namen.set(f, new Set());
            namen.get(f).add(String(k.name_en || '').toLowerCase());
        });
        const konflikte = [...namen.entries()].filter(([, n]) => n.size > 1);
        assert.equal(konflikte.length, 0,
            `Familien mit mehreren Namen: ${konflikte.slice(0, 3).map(([f]) => f).join(' / ')}`);
    });

    it('Armarouge PBL 12 und SSP 34 sind verschiedene Karten', () => {
        // Der gemeldete Fall, als Zahl. Beide 140 HP, aber andere Attacken —
        // und in getrennten Familien. Ueber den Namen fielen sie zusammen.
        const arma = daten.filter(k => String(k.name_en || '').toLowerCase() === 'armarouge');
        const pbl = arma.find(k => k.set === 'PBL' && String(k.number) === '12');
        const ssp = arma.find(k => k.set === 'SSP' && String(k.number) === '34');
        assert.ok(pbl && ssp, 'die beiden Drucke stehen nicht mehr in den Daten');
        assert.notEqual(familie(pbl), familie(ssp),
            'PBL 12 und SSP 34 gelten als derselbe Druck');
    });

    it('echte Nachdrucke fallen weiterhin zusammen', () => {
        // Die Gegenprobe: Ultra Ball ist 18-mal gedruckt worden und muss EIN
        // Eintrag bleiben, sonst haben wir das Problem nur umgedreht.
        const ub = daten.filter(k => String(k.name_en || '').toLowerCase() === 'ultra ball');
        assert.ok(ub.length > 10, 'zu wenige Ultra-Ball-Drucke in den Daten');
        assert.equal(new Set(ub.map(familie)).size, 1,
            'Ultra Ball zerfaellt in mehrere Familien');
    });
});
