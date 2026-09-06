/**
 * Szenesprache: was die Community englisch sagt, bleibt englisch —
 * auch auf der deutschen Seite.
 *
 * Gemeldet am 28.08.2026: "Meta ist Meta und nicht Feld, Sieg ist Win,
 * Niederlage ist Loss, Unentschieden ist Tie und nicht ja, und Sachen,
 * die man halt aus der englischen Sprache im Deutschen nimmt, bleiben
 * auf jeden Fall auch in der deutschen Version."
 *
 * Vorher war das halb umgesetzt. "Tie" stand schon englisch da, direkt
 * daneben "Sieg" und "Niederlage". "Share" stand als Spaltenkopf, drei
 * Ansichten weiter "Anteil" fuer dieselbe Zahl. Der Knopf hiess
 * "Konsistenz", der englische daneben "Consistency" — und der Hinweistext
 * zitierte den Knopf mit dem jeweils anderen Wort.
 *
 * Diese Zusagen halten fest, dass es eine Schreibweise bleibt. Sie
 * pruefen den DEUTSCHEN Block: der englische sagt diese Woerter ohnehin.
 *
 * Nicht geprueft wird der Programmtext. 'btn.consistency' als Schluessel,
 * `share_pct` als CSV-Spalte und `anteil` als Variablenname bleiben, wie
 * sie sind — ein Schluessel ist kein Wort, das jemand liest.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

const iDe = I18N.indexOf('\n  de: {');
assert.ok(iDe > -1, 'der deutsche Block wurde nicht gefunden');
const DE = I18N.slice(iDe);

/* Schluessel und Wert getrennt: geprueft wird nur, was angezeigt wird. */
const EINTRAEGE = [...DE.matchAll(/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g)]
    .map(m => ({ key: m[1], wert: m[2] }));

const wert = key => {
    const e = EINTRAEGE.find(x => x.key === key);
    return e ? e.wert : null;
};

describe('Szenesprache im deutschen Block', () => {
    it('sagt Win und Loss, nicht Sieg und Niederlage', () => {
        // "Tie" stand schon englisch daneben — es war halb uebersetzt.
        for (const [key, soll] of [['bj.win', 'Win'], ['bj.loss', 'Loss'],
                                   ['ma.wins', 'Wins'], ['ma.losses', 'Losses']]) {
            assert.equal(wert(key), soll, `${key} sollte "${soll}" sein`);
        }
        assert.match(wert('mc.avgWins') || '', /Wins/, 'mc.avgWins');
        assert.match(wert('mc.avgLosses') || '', /Losses/, 'mc.avgLosses');
    });

    it('sagt Consistency, nicht Konsistenz', () => {
        assert.equal(wert('btn.consistency'), 'Consistency');
        assert.match(wert('cl.genConsistency') || '', /Consistency/);
        const treffer = EINTRAEGE.filter(e => /Konsistenz/i.test(e.wert));
        assert.deepEqual(treffer.map(e => e.key), [],
            'noch eingedeutscht: ' + treffer.map(e => `${e.key}="${e.wert}"`).join(' | '));
    });

    it('sagt Share, nicht Anteil — jedenfalls dort, wo die Zahl gemeint ist', () => {
        for (const key of ['tier.clShare', 'arc.repLabel']) {
            assert.equal(wert(key), 'Share', `${key}`);
        }
        for (const key of ['meta.sortByShare', 'mc.intelTgShare', 'mc.badgeLadder',
                           'filter.cardShareFilter', 'cl.cardShareFilter']) {
            assert.match(wert(key) || '', /Share/, `${key}`);
        }
    });

    it('nennt die Pflichtkarten Staples', () => {
        assert.match(wert('cl.skelMainHint') || '', /Staples/);
    });

    it('zitiert Knopfbeschriftungen so, wie sie auf dem Knopf stehen', () => {
        /* buildInfo.noBuildYet nannte den Knopf "Max Konsistenz",
           waehrend der Knopf "Max. Konsistenz" hiess — und nach der
           Umstellung haette dort weiter das deutsche Wort gestanden. */
        const hinweis = wert('buildInfo.noBuildYet') || '';
        const knopf = wert('cl.genConsistency') || '';
        assert.ok(hinweis.includes(knopf),
            `der Hinweis "${hinweis}" nennt den Knopf nicht so, wie er heisst: "${knopf}"`);
    });
});

describe('kurz statt erklaerend', () => {
    /* Betreiber: "je mehr dort steht, je mehr kann der Enduser verwirrt
       werden." Diese Grenzen sind nicht schoen, aber sie fangen den
       Rueckfall — vorher stand in menu.hubTitle ein ganzer Relativsatz
       fuer einen Menuepunkt. */
    const HOECHSTENS = {
        'menu.hubTitle': 30,
        'legend.title': 20,
        'legend.summary': 20,
        'tip.techSearchPlaceholder': 30,
        'mc.subtitle': 90,
        'proxy.queueEmpty': 90,
        'buildInfo.noBuildYet': 60,
    };

    for (const [key, max] of Object.entries(HOECHSTENS)) {
        it(`${key} bleibt unter ${max} Zeichen`, () => {
            const v = wert(key);
            assert.ok(v !== null, `${key} fehlt im deutschen Block`);
            assert.ok(v.length <= max,
                `${key} hat ${v.length} Zeichen: "${v}"`);
        });
    }
});

describe('ein Schluessel, eine Beschriftung', () => {
    /* Gefunden am 29.08.2026 beim Wording-Durchgang: 'cb.filterMissing'
       stand in beiden Bloecken ZWEIMAL — einmal als Knopf ("Fehlend"),
       einmal als Aria-Label eines Selects ("Fehlmenge"). In einem
       Objektliteral gewinnt die spaetere Zeile still, also stand auf dem
       Knopf "Fehlmenge (12)". Die beiden Aufrufstellen in
       js/custom-binder.js gaben sogar verschiedene Rueckfalltexte mit —
       sie meinten zwei verschiedene Beschriftungen und teilten sich
       versehentlich einen Schluessel. Aufgeteilt in 'cb.filterMissing'
       und 'cb.filterMissingAria'.

       'cb.delete' stand ebenfalls doppelt, mit gleichem Wert. Harmlos,
       aber die tote Zeile laedt dazu ein, die falsche zu bearbeiten. */
    const schluessel = block =>
        [...block.matchAll(/^ {4}'([a-zA-Z0-9._]+)':/gm)].map(m => m[1]);

    const EN = schluessel(I18N.slice(0, iDe));
    const DEK = schluessel(DE);

    for (const [name, keys] of [['en', EN], ['de', DEK]]) {
        it(`der ${name}-Block vergibt keinen Schluessel doppelt`, () => {
            const doppelt = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
            assert.deepEqual(doppelt, [],
                'still ueberschrieben — die spaetere Zeile gewinnt: ' + doppelt.join(', '));
        });
    }

    it('beide Bloecke fuehren dieselben Schluessel', () => {
        assert.deepEqual(DEK.filter(k => !EN.includes(k)), [], 'nur im deutschen Block');
        assert.deepEqual(EN.filter(k => !DEK.includes(k)), [], 'nur im englischen Block');
    });

    it('jede Aufrufstelle von cb.filterMissing* meint ihre eigene Beschriftung', () => {
        const CB = fs.readFileSync(path.join(ROOT, 'js', 'custom-binder.js'), 'utf8');
        assert.match(CB, /data-filter="missing"[\s\S]{0,120}cbText\('cb\.filterMissing'/,
            'der Filterknopf soll den kurzen Schluessel benutzen');
        assert.match(CB, /aria-label="[^"]*cb\.filterMissingAria/,
            'das Aria-Label des Selects soll den eigenen Schluessel benutzen');
    });
});

describe('Neue Zeilen halten sich an die Hausschreibweise', () => {

    it('die Unentschieden-Zeile unter der Tag-2-Zahl sagt Ties', () => {
        /* NACHTRAG (06.09.2026). Die Zeile kam neu dazu und sagte
           "Unentschieden 10,6 %" — zwei Zentimeter neben "Ø Ties".
           Ich hielt daraufhin die Ø-Beschriftungen fuer einen
           Uebersetzungsrest und wollte sie eindeutschen; diese Datei
           hat das gestoppt. Angepasst wurde die neue Zeile. */
        for (const key of ['mc.day2Unentschieden', 'mc.day2UnentschiedenLeer']) {
            const v = wert(key) || '';
            assert.match(v, /Ties/, `${key} sagt nicht "Ties": "${v}"`);
            assert.ok(!/Unentschieden/.test(v),
                `${key} sagt wieder "Unentschieden": "${v}"`);
        }
    });

    it('die Ø-Beschriftungen bleiben, wie sie sind', () => {
        /* Rueckfallsperre gegen genau meinen Fehler. */
        assert.equal(wert('mc.avgWins'), 'Ø Wins');
        assert.equal(wert('mc.avgTies'), 'Ø Ties');
        assert.equal(wert('mc.avgLosses'), 'Ø Losses');
    });
});
