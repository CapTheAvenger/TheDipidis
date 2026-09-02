/**
 * Zwei Namen, ein Deck — Gruppe 9 der Pruefrunde vom 20.08.2026.
 *
 * Die Meta-Performance verband Ladder und Turniere ueber die Zeichenkette.
 * Wo ein Name nicht traf, entstand keine Luecke, sondern eine ZWEITE ZEILE
 * fuer dasselbe Deck: Dhelmise mit 1.123 Listen auf Platz 10, und
 * "Dhelmise Banette" mit 326,5 gewichteten Antritten auf Platz 132 von 138
 * — hinter der Sichtgrenze. Nach Antritten ist das das zehntgroesste
 * Turnierdeck des Feldes.
 *
 * Diese Datei prueft drei Dinge, und die Reihenfolge ist Absicht:
 *   1. dass die Bruecke wirkt,
 *   2. dass sie NUR wirkt, wo sie es soll,
 *   3. dass alles Uebrige sichtbar unverbunden bleibt.
 *
 * Die dritte ist die wichtigste. Eine falsche Verschmelzung sieht richtig
 * aus; eine sichtbare Luecke ist heilbar.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const TIER = lies('js/app-tier-meta.js');
const ALIAS = JSON.parse(lies('data/archetype_aliases.json'));

const zahl = (v, d = 0) => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : d;
};
function csv(pfad) {
    const zeilen = lies(pfad).replace(/^﻿/, '').trim().split(/\r?\n/);
    const kopf = zeilen[0].split(';').map(s => s.trim());
    return zeilen.slice(1).map(z => {
        const f = z.split(';');
        const o = {};
        kopf.forEach((k, i) => { o[k] = (f[i] || '').trim(); });
        return o;
    });
}

/**
 * app-utils.js laeuft im Browser und greift beim Laden auf localStorage
 * und document zu. Fuer den Test genuegen Attrappen — der Teil, um den es
 * hier geht, braucht nichts davon.
 */
function ladeUtils() {
    const w = {};
    const speicher = { getItem: () => null, setItem() {}, removeItem() {} };
    const dok = {
        addEventListener() {}, removeEventListener() {},
        querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        documentElement: { style: {}, classList: { add() {}, remove() {} } },
        body: { classList: { add() {}, remove() {} } },
    };
    // eslint-disable-next-line no-new-func
    new Function('window', 'localStorage', 'sessionStorage', 'document', 'navigator', 'location',
        lies('js/app-utils.js'))(
        w, speicher, speicher, dok, { language: 'de', userAgent: '' }, { href: '', search: '' });
    return w;
}

const LADDER = csv('data/limitless_online_decks.csv');
const TURNIER = csv('data/online_tournament_top8_decks.csv');
const ladderNamen = new Set(LADDER.map(r => (r.deck_name || '').trim()).filter(Boolean));
const turnierNamen = new Set(TURNIER.map(r => (r.deck_name || '').trim()).filter(Boolean));

// ───────────────────────────────────────────────────────────────────
// 1. Die Bruecke selbst
// ───────────────────────────────────────────────────────────────────
describe('Die Namensbrücke ist gepflegt, nicht geraten', () => {
    it('jede Brücke zeigt auf einen echten Ladder-Namen', () => {
        // Das Ziel MUSS es geben: es ist der kanonische Name, unter dem
        // beide Quellen zusammengeführt werden. Zeigt er ins Leere,
        // erzeugt die Brücke ein Deck, das es nicht gibt.
        for (const e of ALIAS.turnier_zu_ladder) {
            assert.ok(ladderNamen.has(e.ladder),
                `"${e.ladder}" steht in keiner Ladder-Datei`);
        }
    });

    it('und die Turnierseite ist entweder da oder nachweislich ausgerollt', () => {
        // Die Turnierdatei ist ein ROLLENDES FENSTER. Gemessen am
        // 22.08.2026: der Wochenlauf schrieb sie von 124 auf 123 Zeilen,
        // und heraus fiel "Cornerstone Ogerpon" — 0,5 gewichtete
        // Antritte aus einem einzigen Turnier, der kleinstmögliche
        // Eintrag. Der Brückeneintrag war beim Anlegen richtig und ist
        // jetzt wirkungslos, nicht falsch.
        //
        // Deshalb hier keine harte Forderung mehr, dass der Turniername
        // im aktuellen Fenster steht — sondern die Forderung, die
        // wirklich zählt: dass er belegt ist. Ein Eintrag ohne Beleg
        // wäre geraten; ein belegter Eintrag, dessen Deck gerade nicht
        // gespielt wird, ist einfach still. Kommt das Deck zurück,
        // greift er wieder.
        //
        // Was hier NICHT gelockert wird: das Ziel muss existieren (Test
        // darüber), der Turniername darf nicht ohnehin schon treffen
        // (Test darunter), und jeder Eintrag braucht Zahlen im Beleg.
        const ausgerollt = ALIAS.turnier_zu_ladder
            .filter(e => !turnierNamen.has(e.turnier))
            .map(e => e.turnier);
        for (const e of ALIAS.turnier_zu_ladder) {
            if (turnierNamen.has(e.turnier)) continue;
            assert.ok(e.beleg && /\d/.test(e.beleg),
                `"${e.turnier}" steht nicht im aktuellen Turnierfenster UND hat `
                + 'keinen bezifferten Beleg — dann ist nicht mehr nachvollziehbar, '
                + 'ob es den Namen je gab');
        }
        // Rollen ALLE heraus, ist nicht ein Deck ausgeschieden, sondern
        // die Quelle kaputt oder umbenannt. Das ist ein Befund.
        assert.notEqual(ausgerollt.length, ALIAS.turnier_zu_ladder.length,
            'kein einziger Brückeneintrag trifft noch einen Turniernamen — '
            + 'das ist kein Meta-Wandel mehr, sondern ein Quellenproblem: '
            + `${ausgerollt.join(', ')}`);
    });

    it('und die Turnierseite hat vorher wirklich nicht getroffen', () => {
        // Eine Brücke fuer einen Namen, der ohnehin trifft, waere still
        // wirkungslos — und beim naechsten Umbenennen gefaehrlich.
        for (const e of ALIAS.turnier_zu_ladder) {
            assert.ok(!ladderNamen.has(e.turnier),
                `"${e.turnier}" trifft schon direkt — die Brücke ist überflüssig`);
        }
    });

    it('jede Brücke trägt ihren Beleg', () => {
        for (const e of ALIAS.turnier_zu_ladder) {
            assert.ok(e.beleg && e.beleg.length > 40,
                `"${e.turnier}" hat keinen Beleg — dann ist es geraten, nicht geprüft`);
            assert.match(e.beleg, /\d/, `der Beleg zu "${e.turnier}" nennt keine Zahl`);
        }
    });

    it('kein Ziel wird doppelt belegt', () => {
        const ziele = ALIAS.turnier_zu_ladder.map(e => e.ladder);
        assert.equal(new Set(ziele).size, ziele.length,
            'zwei Turniernamen zeigen auf denselben Ladder-Namen — das kann richtig sein, '
            + 'muss dann aber im Beleg stehen');
        const quellen = ALIAS.turnier_zu_ladder.map(e => e.turnier);
        assert.equal(new Set(quellen).size, quellen.length);
    });

    it('die vier geprüften Paare sind drin', () => {
        const m = new Map(ALIAS.turnier_zu_ladder.map(e => [e.turnier, e.ladder]));
        assert.equal(m.get('Dhelmise Banette'), 'Dhelmise');
        assert.equal(m.get('Dudunsparce Mega Froslass'), 'Froslass Dudunsparce');
        assert.equal(m.get('Bolt'), 'Raging Bolt');
        assert.equal(m.get('Cornerstone Ogerpon'), 'Cornerstone Mask Ogerpon');
    });

    it('und die Warnung vor der Automatisierung steht in der Datei', () => {
        // Sie steht dort, weil sie gemessen ist: "mega" zu streichen
        // verschmilzt drei Deckpaare.
        assert.match(ALIAS._meta.warnung, /Mega Greninja/);
        assert.match(ALIAS._meta.regel, /nachgerechnet/);
    });
});

// ───────────────────────────────────────────────────────────────────
// 2. Was bewusst offen bleibt
// ───────────────────────────────────────────────────────────────────
describe('Was nicht verbunden wird, bleibt sichtbar unverbunden', () => {
    it('jeder offene Eintrag ist ein echter Turniername ohne Ladder-Entsprechung', () => {
        for (const e of ALIAS.bewusst_nicht_verbunden) {
            assert.ok(turnierNamen.has(e.turnier), `"${e.turnier}" gibt es gar nicht`);
            assert.ok(!ladderNamen.has(e.turnier),
                `"${e.turnier}" trifft direkt und gehört nicht in diese Liste`);
            assert.ok(e.grund && e.grund.length > 30,
                `"${e.turnier}" steht ohne Grund auf der Liste`);
        }
    });

    it('die Vermutung wird nicht heimlich zur Brücke', () => {
        const bruecken = new Set(ALIAS.turnier_zu_ladder.map(e => e.turnier));
        for (const e of ALIAS.bewusst_nicht_verbunden) {
            assert.ok(!bruecken.has(e.turnier),
                `"${e.turnier}" steht in beiden Listen`);
        }
    });

    it('Brücken plus offene decken alle nicht treffenden Turniernamen ab', () => {
        // Die Richtung, auf die es ankommt: kein Turniername faellt still
        // durch. Sonst entsteht wieder eine zweite Zeile fuer dasselbe
        // Deck, und genau das war der Befund vom 20.08.2026.
        //
        // Die Gegenrichtung wird NICHT geprueft. Die Turnierdatei ist ein
        // rollendes Fenster: am 22.08.2026 schrieb der Wochenlauf sie von
        // 124 auf 123 Zeilen, und heraus fiel "Cornerstone Ogerpon" mit
        // 0,5 Antritten aus einem Turnier. Ein ausgewiesener Eintrag ohne
        // aktuellen Treffer ist wirkungslos, nicht falsch — und beim
        // naechsten Auftreten des Decks sofort wieder richtig. Eine
        // Mengengleichheit haette den Lauf hier rot gemacht, obwohl
        // nichts kaputt ist; der Kommentar im Test darunter beschreibt
        // dieselbe Falle eine Ebene tiefer.
        const nichtTreffend = [...turnierNamen].filter(n => !ladderNamen.has(n)).sort();
        const bekannt = new Set([
            ...ALIAS.turnier_zu_ladder.map(e => e.turnier),
            ...ALIAS.bewusst_nicht_verbunden.map(e => e.turnier),
        ]);
        const durchgefallen = nichtTreffend.filter(n => !bekannt.has(n));
        assert.deepEqual(durchgefallen, [],
            'ein Turniername ist weder verbrückt noch als offen ausgewiesen: '
            + durchgefallen.join(', '));
    });

    it('und es sind so viele, wie die Bruecke ausweist', () => {
        // Fruehere Fassung verdrahtete turnierNamen.size = 120,
        // ladderNamen.size = 131 und gemeinsam = 113 fest. Der Wochenlauf vom
        // 21.08.2026 machte daraus 123 / 132 / 116 — die Bruecke selbst hat
        // gehalten, es waren weiterhin exakt sieben nicht treffende Namen
        // (4 verbrueckt, 3 bewusst offen). Fest verdrahtete Mengen messen also
        // nicht die Bruecke, sondern nur, wann zuletzt gescrapt wurde, und
        // machen den Lauf rot, obwohl nichts kaputt ist. Der Deploy haengt an
        // gruenen Tests — das blockierte ausgerechnet die frischen Daten.
        //
        // Nachtrag 22.08.2026: auch die Gleichheit der ANZAHL ist eine fest
        // verdrahtete Menge, nur besser getarnt. Rollt ein Deck aus dem
        // Turnierfenster, sinkt die linke Seite und die rechte bleibt —
        // dieselbe rote Ampel ohne Defekt. Geprueft wird deshalb die
        // Richtung, die etwas bedeutet: es darf nichts UNausgewiesenes
        // geben. Mehr Ausgewiesene als aktuell Treffende ist der Normalfall
        // eines rollenden Fensters.
        const nichtTreffend = [...turnierNamen].filter(n => !ladderNamen.has(n));
        const ausgewiesen = ALIAS.turnier_zu_ladder.length
            + ALIAS.bewusst_nicht_verbunden.length;
        assert.ok(nichtTreffend.length <= ausgewiesen,
            'nicht treffende Namen: ' + nichtTreffend.length
            + ', in archetype_aliases.json ausgewiesen: ' + ausgewiesen
            + ' — es gibt mehr unverbundene Namen als ausgewiesene Faelle');
        // Die Mengen duerfen wachsen, aber die Ueberschneidung muss die Regel
        // bleiben und die Ausnahme klein. Gemessen 21.08.2026: 116 von 123.
        const gemeinsam = [...turnierNamen].filter(n => ladderNamen.has(n)).length;
        assert.ok(gemeinsam > turnierNamen.size * 0.8,
            `nur ${gemeinsam} von ${turnierNamen.size} Turniernamen treffen die Ladder`);
    });
});

// ───────────────────────────────────────────────────────────────────
// 3. Der Verbund im Renderer
// ───────────────────────────────────────────────────────────────────
describe('Der Verbund fasst zusammen, statt eine zweite Zeile zu bauen', () => {
    it('Turnierzeilen werden unter dem kanonischen Namen addiert', () => {
        assert.ok(/const kanon = \(n\) => _alias\.get\(n\) \|\| n;/.test(TIER));
        assert.ok(/v\.brought \+= d\.brought;/.test(TIER),
            'zwei Zeilen auf denselben Namen wuerden einander ueberschreiben');
        /* NACHTRAG 02.09.2026: die Quote wird weiterhin aus der SUMME neu
           gerechnet — aber aus den Zahlen, die die Zeile auch ZEIGT
           (broughtAnzeige/top8Anzeige, sobald die Datei die gezaehlten
           Spalten fuehrt), nicht mehr fest aus den gewichteten. Der
           Grund: in einer Zeile standen 120, 1.172 und 10,5 %, und
           120/1172 sind 10,2 %. Der Eingangsblock sagte fuer dasselbe
           Deck 10,2 % — zwei Reiter, zwei Zahlen.

           Geprueft wird deshalb die Eigenschaft, nicht der Wortlaut: die
           Quote kommt aus einem Zaehler und einem Nenner DIESER Zeile. */
        assert.ok(/v\.top8ConvPct = vB > 0 \? \(vC \/ vB\) \* 100 : 0;/.test(TIER),
            'die Quote wird nicht aus der Summe neu gerechnet');
        assert.ok(/const vB = \(v\.broughtAnzeige != null\) \? v\.broughtAnzeige : v\.brought;/.test(TIER),
            'die Quote nimmt nicht die Zahl, die daneben steht');
        assert.ok(/const vC = \(v\.top8Anzeige != null\) \? v\.top8Anzeige : v\.top8;/.test(TIER));
    });

    it('die Faktor-Karten werden mit umgeschluesselt', () => {
        // Ohne das stand bei Dhelmise nach dem Zusammenfuehren ein Strich
        // in der Faktor-Spalte — die Bruecke haette den Befund halb
        // behoben und einen neuen aufgemacht. Live gesehen.
        assert.ok(/\[perfVon, rohVon\]\.forEach\(karte => \{/.test(TIER),
            'perfVon/rohVon bleiben auf den Turniernamen stehen');
    });

    it('nicht aufgeloeste Namen werden gezaehlt, geloggt und angezeigt', () => {
        assert.ok(/const nichtZugeordnet = enriched/.test(TIER));
        assert.ok(/console\.info\('\[Meta-Performance\] %d Turniernamen ohne Ladder-Entsprechung/.test(TIER));
        assert.ok(/cm-rang-offen/.test(TIER), 'die Liste wird nirgends gerendert');
        assert.ok(/\$\{offenHtml\}/.test(TIER), 'offenHtml wird gebaut, aber nicht eingesetzt');
    });

    it('der Erklaersatz behauptet nicht mehr, ein Strich hiesse "fehlt in der Datei"', () => {
        // Fuer Dhelmise war der alte Satz buchstaeblich wahr und inhaltlich
        // falsch — der schwerste Teil des Befunds.
        assert.ok(/oder es heißt in den beiden \n?\s*\+ .Quellen verschieden|Quellen verschieden/.test(TIER),
            'der deutsche Satz nennt die zweite Ursache nicht');
        assert.ok(/or it goes by a different name in the two sources/.test(TIER),
            'der englische Satz nennt die zweite Ursache nicht');
    });

    it('ohne die Datei bleibt es beim alten Verhalten, statt zu brechen', () => {
        const block = TIER.slice(TIER.indexOf('let _alias = new Map();'),
            TIER.indexOf('const kanon = (n) =>'));
        assert.ok(/catch \(_e\) \{/.test(block),
            'ein fehlendes Alias-File wuerde die ganze Tabelle verschlucken');
    });
});

// ───────────────────────────────────────────────────────────────────
// 4. Die Zusammenfassung rechnet richtig
// ───────────────────────────────────────────────────────────────────
describe('Zusammengefasste Zeilen tragen die Summe, nicht die letzte Zeile', () => {
    // Der echte Zusammenfassungs-Block, herausgeschnitten und ausgefuehrt.
    const a = TIER.indexOf('                    const turnierVon = new Map();');
    const b = TIER.indexOf('                    const alleNamen = new Set([', a);
    assert.ok(a > 0 && b > a, 'Zusammenfassungs-Block nicht gefunden');
    const block = TIER.slice(a, b);

    function fasse(zeilen, alias) {
        const rumpf = `
            const _alias = new Map(aliasPaare);
            const kanon = (n) => _alias.get(n) || n;
            const enriched = eingabe;
            ${block}
            return [...turnierVon.values()];
        `;
        // eslint-disable-next-line no-new-func
        return new Function('eingabe', 'aliasPaare', rumpf)(zeilen, alias);
    }

    it('zwei Zeilen auf denselben Namen werden addiert', () => {
        const r = fasse([
            { name: 'Dhelmise', brought: 100, top8: 10, broughtPct: 2, top8ConvPct: 10 },
            { name: 'Dhelmise Banette', brought: 300, top8: 30, broughtPct: 6, top8ConvPct: 10 },
        ], [['Dhelmise Banette', 'Dhelmise']]);
        assert.equal(r.length, 1, 'aus zwei Zeilen muss eine werden');
        assert.equal(r[0].name, 'Dhelmise');
        assert.equal(r[0].brought, 400);
        assert.equal(r[0].top8, 40);
        assert.equal(r[0].broughtPct, 8);
        assert.equal(r[0].top8ConvPct, 10, 'die Quote wird neu aus der Summe gerechnet');
    });

    it('die Quote der Summe ist nicht der Mittelwert der Quoten', () => {
        // 10 von 100 und 30 von 900 sind zusammen 40 von 1.000 = 4 %,
        // nicht (10 % + 3,33 %) / 2.
        const r = fasse([
            { name: 'A', brought: 100, top8: 10, broughtPct: 1, top8ConvPct: 10 },
            { name: 'A-lang', brought: 900, top8: 30, broughtPct: 9, top8ConvPct: 3.333 },
        ], [['A-lang', 'A']]);
        assert.equal(r[0].top8ConvPct, 4);
    });

    it('ohne Brücke bleibt jede Zeile für sich', () => {
        const r = fasse([
            { name: 'A', brought: 100, top8: 10, broughtPct: 1, top8ConvPct: 10 },
            { name: 'B', brought: 300, top8: 30, broughtPct: 3, top8ConvPct: 10 },
        ], []);
        assert.equal(r.length, 2);
    });

    it('die Ursprungszeile wird nicht verändert', () => {
        const eingabe = [{ name: 'Dhelmise Banette', brought: 300, top8: 30, broughtPct: 6, top8ConvPct: 10 }];
        fasse(eingabe, [['Dhelmise Banette', 'Dhelmise']]);
        assert.equal(eingabe[0].name, 'Dhelmise Banette',
            'die Eingabe wurde in place umbenannt — andere Leser sehen dann etwas anderes');
    });
});

// ───────────────────────────────────────────────────────────────────
// 5. Ein Deck, drei Zeilen — die Wortreihenfolge
// ───────────────────────────────────────────────────────────────────
describe('City League: derselbe Archetyp in wechselnder Wortreihenfolge', () => {
    const w = ladeUtils();
    const key = w.archetypSchreibwegSchluessel;
    const lege = w.legeSchreibwegeZusammen;

    it('der Schlüssel sortiert nur, er entfernt nichts', () => {
        assert.equal(key('Ogerpon Raging-Bolt'), key('Raging-Bolt Ogerpon'));
        assert.equal(key('Mega Venusaur Ogerpon'), key('Ogerpon Mega Venusaur'));
        // Und das ist die Grenze: "Mega" bleibt ein Wort.
        assert.notEqual(key('Mega Greninja'), key('Greninja'));
        assert.notEqual(key('Mega Gengar'), key('Gengar'));
        assert.notEqual(key('Mega Feraligatr'), key('Feraligatr'));
        assert.notEqual(key('Mega Meganium Mega Venusaur'), key('Mega Venusaur Meganium'));
    });

    it('Groß-/Kleinschreibung und Mehrfach-Leerzeichen stören ihn nicht', () => {
        assert.equal(key('  ogerpon   RAGING-Bolt '), key('Raging-Bolt Ogerpon'));
        assert.equal(key(''), '');
        assert.equal(key(null), '');
    });

    it('am echten Datenstand legt er 38 Schreibweisen zusammen', () => {
        const rows = csv('data/city_league_archetypes_comparison_M3.csv');
        const gruppen = new Map();
        rows.forEach(r => {
            const k = key(r.archetype);
            gruppen.set(k, (gruppen.get(k) || 0) + 1);
        });
        const doppelt = [...gruppen.values()].filter(n => n > 1);
        assert.equal(rows.length, 304);
        assert.equal(gruppen.size, 266, 'erwartet werden 266 Gruppen aus 304 Namen');
        assert.equal(doppelt.reduce((s, n) => s + n - 1, 0), 38);
    });

    it('und keine dieser Gruppen mischt Mega mit Nicht-Mega', () => {
        // Die Gegenprobe, die den Ansatz überhaupt zulässig macht.
        const rows = csv('data/city_league_archetypes_comparison_M3.csv');
        const g = new Map();
        rows.forEach(r => {
            const k = key(r.archetype);
            if (!g.has(k)) g.set(k, []);
            g.get(k).push(r.archetype);
        });
        for (const [, namen] of g) {
            if (namen.length < 2) continue;
            const mega = namen.map(n => /\bmega\b/i.test(n));
            assert.ok(mega.every(Boolean) || mega.every(x => !x),
                'Gruppe mischt Mega und Nicht-Mega: ' + namen.join(' | '));
        }
    });

    it('zusammengelegt wird auf die häufigste Schreibweise', () => {
        const zeilen = [
            { archetype: 'Raging-Bolt Ogerpon', new_count: '31' },
            { archetype: 'Ogerpon Raging-Bolt', new_count: '78' },
        ];
        const erg = lege(zeilen, r => parseInt(r.new_count, 10) || 0,
            (ziel, q) => { ziel.new_count = String((+ziel.new_count) + (+q.new_count)); });
        assert.equal(erg.zeilen.length, 1);
        assert.equal(erg.zeilen[0].archetype, 'Ogerpon Raging-Bolt',
            'die seltenere Schreibweise darf nicht gewinnen');
        assert.equal(erg.zeilen[0].new_count, '109');
        assert.equal(erg.gruppen, 1);
        assert.equal(erg.zusammengelegt, 1);
    });

    it('drei Schreibweisen ergeben eine Zeile und zählen als eine Gruppe', () => {
        const zeilen = [
            { archetype: 'A B C', new_count: '5' },
            { archetype: 'C B A', new_count: '9' },
            { archetype: 'B A C', new_count: '2' },
        ];
        const erg = lege(zeilen, r => +r.new_count,
            (ziel, q) => { ziel.new_count = String((+ziel.new_count) + (+q.new_count)); });
        assert.equal(erg.zeilen.length, 1);
        assert.equal(erg.zeilen[0].new_count, '16');
        assert.equal(erg.gruppen, 1);
        assert.equal(erg.zusammengelegt, 2);
    });

    it('was nicht zusammengehört, bleibt getrennt', () => {
        const zeilen = [
            { archetype: 'Mega Greninja', new_count: '10' },
            { archetype: 'Greninja', new_count: '20' },
        ];
        const erg = lege(zeilen, r => +r.new_count, () => {
            throw new Error('hier darf nichts verschmolzen werden');
        });
        assert.equal(erg.zeilen.length, 2);
        assert.equal(erg.zusammengelegt, 0);
    });

    it('leere Namen fallen heraus, statt zu einer Sammelzeile zu werden', () => {
        const erg = lege([{ archetype: '', new_count: '5' }, { archetype: '   ', new_count: '3' }],
            r => +r.new_count, () => { throw new Error('nichts zu verschmelzen'); });
        assert.equal(erg.zeilen.length, 0);
    });
});

// ───────────────────────────────────────────────────────────────────
// 6. Wie die Zeilen verschmolzen werden
// ───────────────────────────────────────────────────────────────────
describe('Beim Verschmelzen wird gerechnet, nicht überschrieben', () => {
    const CL = lies('js/app-city-league.js');
    // Nur der RUMPF, ohne das umschliessende `if (typeof … === 'function')`:
    // sonst waere der Ausschnitt syntaktisch unvollstaendig.
    const a = CL.indexOf('                    const zahlVon = (r) => parseInt(');
    const b = CL.indexOf('                    cityLeagueData = erg.zeilen;', a);
    assert.ok(a > 0 && b > a, 'Verschmelzungs-Block nicht gefunden');
    const block = CL.slice(a, b).replace(/\n\s*if \(erg\.zusammengelegt > 0\)[\s\S]*$/, '\n');

    function fahre(zeilen) {
        const w = ladeUtils();
        const rumpf = `
            let cityLeagueData = eingabe;
            const window = w;
            const console = { info: () => {} };
            ${block}
            return erg;
        `;
        // eslint-disable-next-line no-new-func
        return new Function('eingabe', 'w', rumpf)(zeilen, w);
    }

    it('Listenzahlen und Anteile werden addiert', () => {
        const erg = fahre([
            { archetype: 'Ogerpon Raging-Bolt', new_count: '78', new_meta_share: '1,16',
              new_avg_placement: '8,10', new_best: '2' },
            { archetype: 'Raging-Bolt Ogerpon', new_count: '31', new_meta_share: '0,46',
              new_avg_placement: '8,45', new_best: '1' },
        ]);
        assert.equal(erg.zeilen.length, 1);
        const r = erg.zeilen[0];
        assert.equal(r.archetype, 'Ogerpon Raging-Bolt');
        assert.equal(r.new_count, '109');
        assert.equal(r.new_meta_share, '1,62');
    });

    it('die Ø-Platzierung wird nach Listenzahl gewichtet, nicht einfach gemittelt', () => {
        // (8,10·78 + 8,45·31) / 109 = 8,20 — der einfache Mittelwert wäre
        // 8,275. Bei 78 gegen 31 Listen ist das ein echter Unterschied.
        const erg = fahre([
            { archetype: 'Ogerpon Raging-Bolt', new_count: '78', new_avg_placement: '8,10' },
            { archetype: 'Raging-Bolt Ogerpon', new_count: '31', new_avg_placement: '8,45' },
        ]);
        assert.equal(erg.zeilen[0].new_avg_placement, '8,20');
    });

    it('die beste Platzierung ist ein Minimum, kein Mittel', () => {
        const erg = fahre([
            { archetype: 'A B', new_count: '10', new_best: '5' },
            { archetype: 'B A', new_count: '3', new_best: '1' },
        ]);
        assert.equal(erg.zeilen[0].new_best, '1');
    });

    it('fehlt einer Seite die Platzierung, gewinnt die vorhandene', () => {
        const erg = fahre([
            { archetype: 'A B', new_count: '10', new_avg_placement: '0' },
            { archetype: 'B A', new_count: '3', new_avg_placement: '7,00' },
        ]);
        assert.equal(erg.zeilen[0].new_avg_placement, '7,00');
    });

    it('die zusammengelegten Schreibweisen werden mitgeführt', () => {
        const erg = fahre([
            { archetype: 'Ogerpon Raging-Bolt', new_count: '78' },
            { archetype: 'Raging-Bolt Ogerpon', new_count: '31' },
        ]);
        assert.deepEqual(erg.zeilen[0]._schreibwege,
            ['Ogerpon Raging-Bolt', 'Raging-Bolt Ogerpon']);
    });

    it('die Gesamtzahl der Listen bleibt gleich — nichts geht verloren, nichts wird doppelt', () => {
        const eingabe = [];
        for (let i = 0; i < 30; i++) eingabe.push({ archetype: 'D' + i, new_count: String(i + 1) });
        eingabe.push({ archetype: 'D3 X', new_count: '7' }, { archetype: 'X D3', new_count: '5' });
        const vorher = eingabe.reduce((s, r) => s + (+r.new_count), 0);
        const erg = fahre(eingabe);
        const nachher = erg.zeilen.reduce((s, r) => s + (+r.new_count), 0);
        assert.equal(nachher, vorher);
        assert.equal(erg.zeilen.length, 31);
    });
});
