/* Die Quellen-Hauptauswahl im Champions-Teams-Reiter (24.09.2026).

   ANLASS (Betreiber): „ich wuerde mir jetzt zum Beispiel gerade genau das
   Champions-Team nachbauen und muesste jetzt halt irgendwo im Internet das
   suchen und das will ich nicht, weil ich habe ja eine eigene Seite".

   Geprueft wird das VERHALTEN der beiden Funktionen, an denen der Umbau
   haengt — ausgefuehrt, nicht im Quelltext gesucht. Keine Zusicherung hier
   nagelt einen Wochenwert fest. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.resolve(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-side-quest.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WURZEL, 'css', 'side-quest.css'), 'utf8');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

/** Eine Funktion aus der Datei holen und WIRKLICH ausfuehren. */
function hole(name, umgebung = '') {
    // eslint-disable-next-line no-new-func
    return new Function(`${umgebung}\n${schneideFunktion(QUELLE, name)}\nreturn ${name};`)();
}

describe('Champions — die Kennung einer Teamkarte', () => {

    /* teamIdentityHash wird von kartenKennung als letzter Ausweg gerufen.
       Hier steht eine Attrappe, die nur zurueckgibt, was sie bekommen hat —
       geprueft wird die REIHENFOLGE der drei Ausweichstufen, nicht der
       Hash selbst. */
    const UMGEBUNG = 'function teamIdentityHash(t){ return "hash:" + JSON.stringify(t); }';

    it('nimmt den Replika-Code, wenn es einen gibt', () => {
        const kartenKennung = hole('kartenKennung', UMGEBUNG);
        assert.equal(kartenKennung({ replica_code: 'ABC123', paste_id: 'xyz' }), 'ABC123');
    });

    it('faellt ohne Code auf die Paste-Kennung zurueck', () => {
        const kartenKennung = hole('kartenKennung', UMGEBUNG);
        assert.equal(kartenKennung({ replica_code: '', paste_id: 'QGsL7HXz' }), 'QGsL7HXz');
    });

    it('zwei Teams OHNE Code bekommen verschiedene Kennungen', () => {
        /* DER FEHLER, DEN DAS VERHINDERT (gemessen 24.09.2026):
           Bis heute war die Kennung immer der Replika-Code, weil jedes Team
           aus dem VGCPastes-Sheet einen trug. Die Teams vom letzten Major
           tragen ihn nicht — an Baltimore gemessen hatten 16 von 155
           Platzierungen einen Code, alle 155 aber eine Teamliste.

           Waere die Kennung der Code geblieben, haetten 139 Karten dieselbe
           LEERE Kennung gehabt. Jeder Knopf auf jeder dieser Karten haette
           dasselbe erste Team geoeffnet — und niemand haette es bemerkt,
           weil ja EIN Team erschienen waere. Nur eben immer dasselbe. */
        const kartenKennung = hole('kartenKennung', UMGEBUNG);
        const a = kartenKennung({ replica_code: '', paste_id: 'AAA' });
        const b = kartenKennung({ replica_code: '', paste_id: 'BBB' });
        assert.notEqual(a, b, 'zwei Teams ohne Code teilen sich eine Kennung');
    });

    it('ohne Code UND ohne Paste bleibt der Inhaltsschluessel', () => {
        const kartenKennung = hole('kartenKennung', UMGEBUNG);
        const k = kartenKennung({ replica_code: '', team_name: 'Eigenbau' });
        assert.ok(k.startsWith('hash:'), k);
    });

    it('ohne Team ueberhaupt gibt es eine leere Kennung statt eines Absturzes', () => {
        const kartenKennung = hole('kartenKennung', UMGEBUNG);
        assert.equal(kartenKennung(null), '');
    });
});

describe('Champions — der Artname steht zweisprachig da, wo die Quelle das hergibt', () => {

    it('mit deutschem Namen steht beides da', () => {
        const artName = hole('artName');
        assert.equal(artName({ name: 'Excadrill', name_de: 'Stalobor' }),
                     'Excadrill – Stalobor');
    });

    it('ohne deutschen Namen bleibt es beim englischen — nichts wird erfunden', () => {
        /* Die VGCPastes-Quelle fuehrt kein name_de. Dort darf sich durch
           diesen Umbau NICHTS aendern; einen deutschen Namen dazuzuraten
           waere eine Behauptung ueber Daten, die es nicht gibt. */
        const artName = hole('artName');
        assert.equal(artName({ name: 'Salamence' }), 'Salamence');
        assert.equal(artName({ name: 'Salamence', name_de: '' }), 'Salamence');
    });

    it('ist der deutsche Name derselbe, steht er nicht doppelt da', () => {
        const artName = hole('artName');
        assert.equal(artName({ name: 'Ditto', name_de: 'Ditto' }), 'Ditto');
    });

    it('ohne jeden Namen steht ein Gedankenstrich statt "undefined"', () => {
        const artName = hole('artName');
        assert.equal(artName({}), '—');
    });
});

describe('Champions — die drei Quellen', () => {

    /* Die Liste wird aus der Datei gelesen und AUSGEFUEHRT, nicht im
       Quelltext gesucht: ein Grep haette nicht bemerkt, wenn zwei Quellen
       auf dieselbe Datei zeigen. */
    function quellen() {
        const m = /const QUELLEN = (\[[\s\S]*?\n    \]);/.exec(QUELLE);
        assert.ok(m, 'die Quellenliste steht nicht mehr da, wo sie stand');
        /* DATA_URL ist hier ein PLATZHALTER, kein Pfad.

           Die Liste nennt die erste Quelle ueber die Konstante DATA_URL;
           zum Auswerten braucht es irgendeinen Wert. Er darf NICHT wie ein
           Pfad unter data/ aussehen: der weite Blick des Wachhunds
           (tests/unit/test-testdaten-wachhund.js) haelt jede Datei, in der
           so ein Pfad steht, fuer datenlesend — und diese Datei liest
           ausschliesslich js/app-side-quest.js und css/side-quest.css.
           Gemessen am 24.09.2026: mit dem echten Pfad zaehlte der Wachhund
           drei Ungleichungen aus dieser Datei, die es an Live-Daten gar
           nicht gibt.

           Die Zusicherung darunter bleibt scharf: traegt eine zweite
           Quelle ebenfalls DATA_URL, sind beide Werte gleich und der
           Doppeleintrag faellt auf. */
        // eslint-disable-next-line no-new-func
        return new Function('const DATA_URL = "<platzhalter>";'
                            + `return ${m[1]};`)();
    }

    it('es sind drei, und jede hat eine eigene Datei', () => {
        const q = quellen();
        assert.ok(q.length >= 3, `nur ${q.length} Quellen`);
        const dateien = q.map(x => x.url);
        assert.equal(new Set(dateien).size, dateien.length,
                     'zwei Quellen lesen dieselbe Datei: ' + dateien.join(', '));
    });

    it('jede Quelle traegt Kennung, Datei, beide Sprachen und einen Anbieter', () => {
        for (const x of quellen()) {
            assert.ok(x.id && x.url, JSON.stringify(x));
            assert.ok(x.de && x.en, 'eine Quelle hat keinen Namen in beiden Sprachen: ' + x.id);
            assert.ok(x.anbieter, 'eine Quelle nennt ihren Anbieter nicht: ' + x.id);
        }
    });

    it('nur die VGCPastes-Quelle behauptet Statuswertpunkte zu fuehren', () => {
        /* Eine Open Team List blendet EVs und IVs aus — gemessen an der
           Schnittstelle von VR Pastes am 24.09.2026: die Felder fehlen in
           der Antwort, sie sind nicht leer. Wer hier hatEv auf true setzt,
           laesst den Hinweis verschwinden und behauptet damit Daten, die
           es nicht gibt. */
        const q = quellen();
        const mitEv = q.filter(x => x.hatEv === true).map(x => x.id);
        assert.deepEqual(mitEv, ['vgcpastes'], 'unerwartet: ' + mitEv.join(', '));
    });

    it('der Anbieter der Major-Quelle ist nicht ihr Reitername', () => {
        /* Sonst stand "Letztes Major" zweimal untereinander da — einmal als
           aktiver Knopf, einmal als Quellenlink darunter. */
        const major = quellen().filter(x => x.id === 'major')[0];
        assert.ok(major, 'die Major-Quelle fehlt');
        assert.notEqual(major.anbieter, major.de);
        assert.notEqual(major.anbieter, major.en);
    });
});

describe('Champions — das CSS der Auswahlleiste haelt am hellen Grund', () => {

    it('die Leiste benutzt KEINE --sq-Variable', () => {
        /* BEFUND, im Bild gemessen (24.09.2026): die --sq-*-Reihe ist auf
           .sq-console beschraenkt — den dunklen Bereich. Der Teams-Reiter
           liegt hell und ausserhalb, dort sind die Variablen undefiniert.
           Die Auswahlleiste sah dadurch aus wie eine Reihe Links statt wie
           Knoepfe: jede Flaeche blieb durchsichtig, ohne dass irgendwo ein
           Fehler entstand. */
        const ab = CSS.indexOf('QUELLEN-HAUPTAUSWAHL');
        assert.ok(ab > 0, 'der Abschnitt der Auswahlleiste steht nicht mehr da');
        /* NUR bis zur Konsolen-Marke lesen. Dahinter beginnt der DUNKLE
           Bereich, und der benutzt die --sq-Reihe voellig zu Recht —
           er definiert sie ja selbst auf .sq-console. Der erste Anlauf
           dieser Zusicherung las bis Dateiende und meldete deshalb 250
           Treffer, die alle in Ordnung waren. */
        const bis = CSS.indexOf('/* \u2500\u2500 Champions "console"', ab);
        assert.ok(bis > ab,
            'die Konsolen-Marke steht nicht mehr HINTER der Auswahlleiste — '
            + 'dann liegt der helle Block im dunklen Bereich');
        const abschnitt = CSS.slice(ab, bis);
        const treffer = abschnitt.match(/var\(--sq-[a-z0-9-]+/g) || [];
        assert.deepEqual(treffer, [],
            'im hellen Bereich benutzte --sq-Variablen: ' + treffer.join(', '));
    });

    it('die Tippflaeche der Quellenknoepfe bleibt bei 44 px', () => {
        /* Die Entscheidung aus der Mobil-Optimierung steht (40 statt 44 px
           ist ausdruecklich abgelehnt, siehe docs/geparkte-features.md). */
        const m = /\.side-quest-quelle-btn\s*\{[^}]*min-height:\s*(\d+)px/.exec(CSS);
        assert.ok(m, 'die Quellenknoepfe haben keine gemessene Mindesthoehe');
        assert.ok(Number(m[1]) >= 44, `nur ${m[1]} px Tippflaeche`);
    });
});
