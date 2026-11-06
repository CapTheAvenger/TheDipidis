/* UI-161 (Hausi, 06.11.2026): „beim Legendary Stadium … die linke Haelfte M6 75 wird gar nicht angezeigt und im
   Deck taucht bei Max Consistency das zweite Stadion nicht auf“. Die Japan-Zeilen buchen die ganze Menge (bis 4)
   auf EINE Nummer; Kartenuebersicht, Deduplizierung und Deck fassten die zwei Haelften ueber den NAMEN zusammen.
   Geprueft wird das Verhalten: die Funktionen aus js/app-utils.js laufen in einem vm-Kontext. Die Stellen, an denen
   sie hängen, werden als Text gesucht — nach dem Ausschneiden der Kommentare. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const UT = fs.readFileSync(path.join(WURZEL, 'js', 'app-utils.js'), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneide(q, name) {
    const i = q.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('fehlt: ' + name);
    let tiefe = 0;
    for (let j = q.indexOf('{', i); j < q.length; j++) {
        if (q[j] === '{') tiefe++;
        else if (q[j] === '}' && --tiefe === 0) return q.slice(i, j + 1);
    }
    throw new Error('Klammer offen: ' + name);
}
const ctx = vm.createContext({ Object, Math, String, Number, Array, Set, RegExp, parseInt, parseFloat });
vm.runInContext(/const LEGENDARY_STADIEN_NUMMERN = [^;]*;/.exec(UT)[0].replace('const ', 'var ') + '\n'
    + ['istLegendaryStadion', 'legendaryPartnerNummer', 'legendaryHaelftenAufteilen', 'legendaryHaelftenImDeck']
        .map((n) => schneide(UT, n)).join('\n'), ctx);

const bild = (n) => 'https://x/tpc/M6/M6_' + n + '_R_JP_LG.png';
const zeile = (o) => Object.assign({ period: 'W38', archetype: 'A', tournament_id: '1', date: 'd', meta: 'City League',
    card_name: 'Legendary Lava Cave', set_code: 'M6', set_number: '76', card_identifier: 'M6 76', total_count: '4',
    max_count: '4', deck_inclusion_count: '1', average_count: '4,0', average_count_overall: '2,0', image_url: bild(76) }, o);

describe('UI-161 Legendary-Stadien: beide Haelften', () => {
    it('Ausschneiden hat nicht alles entfernt', () => assert.ok(ohneKommentare(UT).length > UT.length * 0.3));

    it('eine Zeile mit 4 auf EINER Nummer wird auf das Paar verteilt (je 2, Bild der Partnernummer)', () => {
        const aus = ctx.legendaryHaelftenAufteilen([zeile({})]);
        assert.equal(aus.length, 2);
        const [a, b] = aus;
        assert.equal(a.set_number, '76'); assert.equal(b.set_number, '75');
        assert.equal(a.max_count, '2'); assert.equal(b.max_count, '2');
        assert.equal(a.total_count, '2'); assert.equal(a.average_count, '2'); assert.equal(a.average_count_overall, '1');
        assert.equal(b.deck_inclusion_count, '1');
        assert.equal(b.card_identifier, 'M6 75');
        assert.equal(b.image_url, bild(75));
    });

    it('Partnerhaelfte schon in derselben Gruppe: nichts aendern; andere Karten bleiben unberuehrt; zweiter Aufruf aendert nichts', () => {
        const paar = [zeile({ total_count: '2', max_count: '2' }), zeile({ set_number: '75', total_count: '2', max_count: '2', image_url: bild(75) })];
        const aus = ctx.legendaryHaelftenAufteilen(paar.concat([zeile({ card_name: 'Gym', set_code: 'M5', set_number: '76' })]));
        assert.equal(aus.length, 3);
        assert.equal(aus[0].max_count, '2');
        assert.equal(aus[2].max_count, '4');
        assert.equal(ctx.legendaryHaelftenAufteilen(aus), aus);
        const einmal = ctx.legendaryHaelftenAufteilen([zeile({})]);
        assert.equal(ctx.legendaryHaelftenAufteilen(einmal).length, 2);
    });

    it('Paare sind 71/72, 73/74, 75/76', () => {
        assert.equal(ctx.legendaryPartnerNummer('71'), '72');
        assert.equal(ctx.legendaryPartnerNummer('74'), '73');
        assert.equal(ctx.legendaryPartnerNummer('076'), '75');
    });

    it('im fertigen Deck: 3 auf einer Nummer -> 2 + 2, eine Karte mit dem niedrigsten Wert faellt weg, Summe bleibt', () => {
        const deck = [
            { card_name: 'Legendary Lava Cave', set_code: 'M6', set_number: '76', image_url: bild(76), addCount: 3, consistencyScore: 80 },
            { card_name: 'Boss', set_code: 'MEG', set_number: '114', addCount: 2, consistencyScore: 90 },
            { card_name: 'Tech', set_code: 'TWM', set_number: '1', addCount: 1, consistencyScore: 10 },
        ];
        const aus = ctx.legendaryHaelftenImDeck(deck);
        const summe = (l) => l.reduce((s, e) => s + e.addCount, 0);
        assert.equal(summe(aus), summe(deck));
        assert.equal(deck[2].addCount, 1, 'die Eingabe bleibt unveraendert');
        const leg = aus.filter((e) => /Legendary/.test(e.card_name)).map((e) => e.set_number + ':' + e.addCount).sort();
        assert.equal(JSON.stringify(leg), JSON.stringify(['75:2', '76:2']));
        assert.ok(!aus.some((e) => e.card_name === 'Tech'), 'die schwaechste Karte faellt weg');
        assert.equal(aus.find((e) => e.set_number === '75').image_url, bild(75));
    });

    it('im Deck: beide Haelften schon da -> unveraendert', () => {
        const deck = [
            { card_name: 'Legendary Lava Cave', set_code: 'M6', set_number: '76', addCount: 2 },
            { card_name: 'Legendary Lava Cave', set_code: 'M6', set_number: '75', addCount: 2 },
        ];
        assert.equal(JSON.stringify(ctx.legendaryHaelftenImDeck(deck).map((e) => e.addCount)), '[2,2]');
    });

    it('die Stellen haengen daran: Laden, Zusammenfassen, Deduplizieren, Deckbau, Hinzufuegen', () => {
        const cl = ohneKommentare(fs.readFileSync(path.join(WURZEL, 'js', 'app-city-league.js'), 'utf8'));
        const db = ohneKommentare(fs.readFileSync(path.join(WURZEL, 'js', 'app-deck-builder.js'), 'utf8'));
        assert.ok((cl.match(/legendaryHaelftenAufteilen\(/g) || []).length >= 2, 'beide Ladewege der Analyse-CSV');
        assert.match(cl, /istLegendaryStadion\(row\.set_code, row\.set_number\)/, 'Zusammenfassen je Nummer');
        assert.match(db, /istLegendaryStadion\(setCode, setNumber\)\) \{\s*return nameKey \+ '\|'/, 'Deduplizieren je Nummer');
        assert.match(db, /cardsToAdd = legendaryHaelftenImDeck\(cardsToAdd\)/, 'Verteilung im Deckbau');
        assert.equal((db.match(/\} else if \(legendaryHaelfte\) \{\s*existingKey = null;/g) || []).length, 2, 'beide Hinzufuegen-Wege');
        assert.equal((db.match(/if \(legendaryHaelfte && deck\[deckKey\] >= 2\)/g) || []).length, 2, 'je Nummer hoechstens 2');
    });
});
