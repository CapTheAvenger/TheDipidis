/**
 * ACE SPEC als eigene Liste — quer zu den Kartenarten.
 *
 * BESTELLT vom Betreiber am 11.09.2026: „bei Meist gespielte Karten
 * sollte Ace Spec noch mal einzeln sein, also ruhig die ACE Spec in der
 * jeweiligen Kategorie anzeigen wo sie hingehören aber für Ace Spec
 * gesamt auch zeigen."
 *
 * WARUM DAS NICHT EINFACH EINE SIEBTE KARTENART IST
 * -------------------------------------------------
 * Die sechs bestehenden Arten wählen über die Spalte `type` aus und
 * schneiden einander nie: eine Karte ist Item ODER Ausrüstung ODER
 * Stadion. ACE SPEC ist keine Art, sondern ein Kennzeichen — gemessen an
 * data/current_meta_card_data.csv (11.09.2026) verteilen sich die 23
 * ACE-SPEC-Karten des Metas auf Item (14), Ausrüstung (4),
 * Spezial-Energie (3) und Stadion (2). Sie bleiben dort stehen UND
 * bekommen eine eigene Liste; eine Karte steht damit bewusst zweimal da.
 *
 * DER HEIKLE TEIL IST DER LEERE WERT
 * ----------------------------------
 * `is_ace_spec` kennt drei Werte: "Yes", "No" und LEER. Leer heißt „die
 * Regel konnte es nicht belegen", nicht „nein"
 * (backend/core/ace_spec_regel.py lässt das Feld bewusst offen, wo sie
 * nichts belegen kann — am 11.09.2026 bei 7 von 528 Namen). Eine Karte
 * ohne Beleg in die ACE-SPEC-Liste zu stellen wäre geraten, und genau
 * das hält dieser Test fest.
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

const NACH_ART = schneide('function staplesNachArt(daten, artId)', '\n        /**');
const ZAEHLUNG = schneide('function staplesArtZaehlung(daten)',
                          '\n        function staplesAnzahl()');

const ARTEN = (() => {
    const a = SRC.indexOf('const STAPLES_ARTEN = [');
    const b = SRC.indexOf('\n        ];', a);
    assert.ok(a > -1 && b > a, 'STAPLES_ARTEN nicht gefunden');
    return new Function(SRC.slice(a, b + 10) + '\nreturn STAPLES_ARTEN;')();
})();
const SCHWELLE = Number(/const STAPLES_ART_SCHWELLE\s*=\s*(\d+)/.exec(SRC)[1]);
const ART_MAX = Number(/const STAPLES_ART_MAX\s*=\s*(\d+)/.exec(SRC)[1]);

function bau() {
    const attrappen = { STAPLES_ARTEN: ARTEN, STAPLES_ART_SCHWELLE: SCHWELLE,
                        STAPLES_ART_MAX: ART_MAX };
    return new Function(...Object.keys(attrappen),
        NACH_ART + ZAEHLUNG +
        '\nreturn { waehle: staplesNachArt, zaehl: staplesArtZaehlung };'
    )(...Object.values(attrappen));
}

/* Echte Karten des laufenden Metas, mit ihren echten Werten aus
   data/current_meta_card_data.csv (11.09.2026). Die vier ACE SPEC hier
   stehen absichtlich in vier VERSCHIEDENEN Arten — an einer Liste, in
   der alle vom selben Typ sind, liesse sich die Querschnitt-Eigenschaft
   nicht messen. */
function karten() {
    return [
        { name: 'Night Stretcher',   type: 'Item',           global_share: 100.0, is_ace_spec: 'No' },
        { name: 'Unfair Stamp',      type: 'Item',           global_share: 53.2,  is_ace_spec: 'Yes' },
        { name: 'Secret Box',        type: 'Item',           global_share: 50.0,  is_ace_spec: 'Yes' },
        { name: "Hero's Cape",       type: 'Tool',           global_share: 41.9,  is_ace_spec: 'Yes' },
        { name: 'Legacy Energy',     type: 'Special Energy', global_share: 25.8,  is_ace_spec: 'Yes' },
        { name: 'Grand Tree',        type: 'Stadium',        global_share: 12.9,  is_ace_spec: 'Yes' },
        { name: 'Area Zero Underdepths', type: 'Stadium',    global_share: 33.9,  is_ace_spec: 'No' },
        { name: 'Shaymin',           type: 'Basic',          global_share: 80.6,  is_ace_spec: 'No' },
        { name: 'Rätselkarte',       type: 'Item',           global_share: 60.0,  is_ace_spec: '' },
    ];
}

describe('ACE SPEC ist eine eigene Liste, keine siebte Kartenart', () => {

    it('es gibt den Eintrag, und er waehlt nicht ueber den Typ aus', () => {
        const ace = ARTEN.filter(a => a.id === 'ace')[0];
        assert.ok(ace, 'die Art "ace" fehlt in STAPLES_ARTEN');
        assert.equal(ace.kennzeichen, 'ace_spec');
        assert.equal(ace.typen, undefined,
            'die ACE-SPEC-Liste haengt an einem Kennzeichen, nicht an der Spalte type — '
            + 'mit `typen` waere sie wieder eine Art, die andere ausschliesst');
        assert.equal(ace.de, 'ACE SPEC');
        assert.equal(ace.en, 'ACE SPEC');
    });

    it('sie steht hinter den sechs Arten', () => {
        /* Eine Querliste gehoert ans Ende: davor stehen die Arten, die
           einander ausschliessen, danach die, die sie schneiden.
           Seit dem 11.09.2026 sind es zwei solcher Querlisten — „Neues
           Set" kam dazu. Beide waehlen ueber ein Kennzeichen; geprueft
           wird deshalb, dass ACE SPEC hinter allen sechs ARTEN steht,
           nicht dass sie die allerletzte ist. */
        const sechs = ['pokemon', 'supporter', 'item', 'tool', 'stadion', 'energie'];
        const iAce = ARTEN.findIndex(a => a.id === 'ace');
        assert.ok(iAce > -1, 'ACE SPEC fehlt ganz');
        sechs.forEach((id) => {
            const i = ARTEN.findIndex(a => a.id === id);
            assert.ok(i > -1 && i < iAce,
                `„${id}" steht hinter ACE SPEC — die Arten gehoeren nach vorn`);
        });
        ARTEN.slice(iAce).forEach((a) => {
            assert.ok(a.kennzeichen,
                `hinter ACE SPEC steht „${a.id}" ohne Kennzeichen — dort gehoeren `
                + 'nur Querlisten hin');
        });
    });

    it('nimmt genau die belegten ACE SPEC ueber der Schwelle', () => {
        const g = bau();
        const namen = g.waehle(karten(), 'ace').map(c => c.name);
        assert.deepEqual(namen, ['Unfair Stamp', 'Secret Box', "Hero's Cape", 'Legacy Energy']);
        // Grand Tree ist eine ACE SPEC, liegt aber unter der Schwelle.
        assert.ok(!namen.includes('Grand Tree'));
    });

    it('ein LEERES Kennzeichen zaehlt nicht als ACE SPEC', () => {
        /* Der eigentliche Punkt. Leer heisst "nicht belegt"; wer es als
           "ja" liest, stellt eine geratene Karte in eine Liste, die
           nach Regel aussieht. */
        const g = bau();
        const namen = g.waehle(karten(), 'ace').map(c => c.name);
        assert.ok(!namen.includes('Rätselkarte'),
            'eine Karte ohne belegtes Kennzeichen steht in der ACE-SPEC-Liste');
    });

    it('die Karten bleiben AUSSERDEM in ihrer eigenen Art stehen', () => {
        /* Genau die Bestellung: "ruhig die ACE Spec in der jeweiligen
           Kategorie anzeigen wo sie hingehoeren aber fuer Ace Spec
           gesamt auch zeigen." */
        const g = bau();
        assert.ok(g.waehle(karten(), 'item').map(c => c.name).includes('Unfair Stamp'));
        assert.ok(g.waehle(karten(), 'tool').map(c => c.name).includes("Hero's Cape"));
        assert.ok(g.waehle(karten(), 'energie').map(c => c.name).includes('Legacy Energy'));
    });

    it('die Zaehlung am Knopf kennt die neue Liste', () => {
        const g = bau();
        const z = g.zaehl(karten());
        assert.equal(z.ace, 4);
        // Und die alten Zahlen stehen unveraendert daneben.
        /* Vier Items ueber der Schwelle: Night Stretcher, Raetselkarte,
           Unfair Stamp, Secret Box. Die Raetselkarte ist dabei — sie IST
           ein Item; nur als ACE SPEC ist sie nicht belegt. Genau diese
           Trennung soll das Kennzeichen leisten. */
        assert.equal(z.item, 4);
        assert.equal(z.tool, 1);
        assert.equal(z.stadion, 1);   // Area Zero Underdepths; Grand Tree ist zu klein
    });

    it('ohne belegte ACE SPEC gibt es keinen Knopf', () => {
        /* Die Knopfzeile blendet eine Art mit null Treffern aus
           (renderTopCardsWidget). Hier wird nur sichergestellt, dass die
           Zaehlung dann wirklich null meldet statt zu werfen. */
        const g = bau();
        const ohne = karten().map(c => Object.assign({}, c, { is_ace_spec: 'No' }));
        assert.equal(g.zaehl(ohne).ace, 0);
    });

    it('die Karten tragen das Kennzeichen ueberhaupt erst mit', () => {
        /* Ohne diese zwei Stellen in calculateGlobalCardStats ist das
           Feld am Widget undefined und die Liste bliebe fuer immer leer —
           ein Fehler, den kein Sandkasten-Test bemerkt, weil er seine
           Karten selbst baut. */
        assert.match(SRC, /is_ace_spec:\s*''/,
            'calculateGlobalCardStats legt das Feld nicht mehr an');
        assert.match(SRC, /globalCardStats\[cardName\]\.is_ace_spec = 'Yes'/,
            'das Kennzeichen wird beim Zusammenfassen nicht mehr gesetzt');
        assert.match(SRC, /is_ace_spec: card\.is_ace_spec/,
            'das Kennzeichen faellt beim Bau des Ergebnisses wieder heraus');
    });
});
