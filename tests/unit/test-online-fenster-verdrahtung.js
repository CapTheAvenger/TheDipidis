/**
 * Das 14-Tage-Fenster im Meta Call — Verdrahtung und Waechter.
 *
 * BEFUND (05.09.2026): der Praediktor rechnete mit KUMULATIVEN
 * Online-Anteilen seit Formatbeginn. `ladderPctDamped` traegt je nach
 * Zweig 12 bis 30 % des vorhergesagten Anteils — ein Deck, das seit
 * drei Wochen verschwunden ist, zog das prognostizierte Feld also
 * weiter an sich. Gemessen: Toucannon 2,55 % kumulativ gegen 0,81 %
 * im Fenster — 19 Raenge Unterschied, kumulativ mitten im Feld.
 *
 * Der Betreiber hat am 05.09.2026 ein 14-Tage-Fenster entschieden.
 * Diese Suite haelt fest, was daran nicht verrutschen darf:
 *
 *  1. Die Quelle wird ueberhaupt gelesen und ersetzt `ladderShare`.
 *  2. Der Kumulativstand geht nicht verloren, sondern steht als
 *     `ladderShareKumulativ` daneben — sonst koennte die Anzeige
 *     ihren Nenner nicht nennen.
 *  3. Zwei Waechter stehen davor. Ohne sie waere die Umstellung
 *     gefaehrlicher als der Fehler, den sie behebt: `ladderShare`
 *     speist `presenceCap`, ein Deck ohne Fensterzeile faellt also
 *     lautlos aus dem Feld.
 *      (a) Deckungsgrad unter 80 % -> Fenster komplett verwerfen.
 *      (b) Stand aelter als 10 Tage -> verwerfen (ein eingefrorener
 *          Fensterstand sieht frisch aus und ist es nicht).
 *  4. Die Siegquote bleibt kumulativ. Aus zwei kumulativen Quoten
 *     laesst sich die Fensterquote NICHT rekonstruieren; wer sie
 *     trotzdem aus dem Fenster nimmt, erfindet sie.
 *  5. Die Anzeige nennt den Nenner (Fenster UND kumulativ).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-meta-call.js'), 'utf8');
const I18N   = fs.readFileSync(path.join(WURZEL, 'js', 'i18n.js'), 'utf8');

/* Der Block selbst, nicht die ganze Datei: `§1b` steht auch oben in der
   Zustandsdeklaration ("siehe §1b weiter unten"), und ein Schnitt dort
   haette den halben Praediktor mitgenommen. */
/* Liest eine der ausgelieferten CSV-Dateien. `skip` ueberspringt die
   Kommentar-Kopfzeile der Fensterdatei. */
function lies(rel, skip) {
  const roh = fs.readFileSync(path.join(WURZEL, rel), 'utf8').replace(/^\uFEFF/, '');
  const zeilen = roh.split('\n').slice(skip).filter(z => z.trim());
  const kopf = zeilen[0].replace(/\r$/, '').split(';');
  return zeilen.slice(1).map(z => {
    const teile = z.replace(/\r$/, '').split(';');
    const o = {};
    kopf.forEach((k, i) => { o[k] = teile[i]; });
    return o;
  });
}

function fensterBlock() {
  const start = QUELLE.indexOf('§1b  14-Tage-Fenster');
  const ende  = QUELLE.indexOf('Online tournament top-8 stats', start);
  if (start < 0 || ende < 0) throw new Error('§1b-Block nicht gefunden');
  return QUELLE.slice(start, ende);
}


describe('Online-Fenster (14 Tage) im Meta Call', () => {
    it('§1b liest das Fenster und ersetzt den Ladder-Anteil', () => {
      assert.ok(QUELLE.includes('limitless_online_fenster.csv'),
        'die Fensterdatei wird nicht geladen');
      assert.ok(QUELLE.includes('limitless_online_fenster_meta.json'),
        'ohne die Meta-Datei kann die Anzeige den Nenner nicht nennen');
      assert.ok(/d\.ladderShare\s*=\s*\(f == null\)/.test(QUELLE),
        'ladderShare wird nicht aus dem Fenster gesetzt');
    });

    it('der Kumulativstand bleibt erhalten', () => {
      assert.ok(QUELLE.includes('d.ladderShareKumulativ = d.ladderShare;'),
        'der Kumulativstand wird ueberschrieben statt danebengestellt');
      const idx = QUELLE.indexOf('d.ladderShareKumulativ = d.ladderShare;');
      const zuweisung = QUELLE.indexOf('d.ladderShare = (f == null)');
      assert.ok(idx > -1 && zuweisung > idx,
        'der Kumulativstand muss VOR dem Ueberschreiben gesichert werden');
    });

    it('beide Waechter stehen davor', () => {
      assert.ok(/FENSTER_MAX_ALTER_TAGE\s*=\s*10\b/.test(QUELLE),
        'kein Altersdeckel — ein eingefrorener Stand sieht frisch aus');
      assert.ok(/FENSTER_MIN_DECKUNG\s*=\s*0\.8\b/.test(QUELLE),
        'keine Mindestdeckung — Decks ohne Fensterzeile fielen lautlos aus dem Feld');
      assert.ok(QUELLE.includes('alter > FENSTER_MAX_ALTER_TAGE'),
        'der Altersdeckel wird nicht geprueft');
      assert.ok(QUELLE.includes('deckung < FENSTER_MIN_DECKUNG'),
        'die Mindestdeckung wird nicht geprueft');
    });

    it('ein angeschlagener Waechter verwirft GANZ, nicht halb', () => {
      const block = fensterBlock();
      // Die Zuweisung an ladderShare darf nur im else-Zweig stehen.
      const zuweisungen = (block.match(/d\.ladderShare = \(f == null\)/g) || []).length;
      assert.strictEqual(zuweisungen, 1,
        'mehr als eine Zuweisung — ein Waechter koennte sie halb durchlassen');
      assert.ok(block.includes('Es gilt der Kumulativstand.'),
        'die Warnung sagt nicht, worauf zurueckgefallen wird');
    });

    it('die Siegquote wird NICHT aus dem Fenster genommen', () => {
      const block = fensterBlock();
      assert.ok(!/onlineWinPct\s*=/.test(block),
        'onlineWinPct wird im Fensterblock ueberschrieben — aus zwei kumulativen '
        + 'Quoten laesst sich die Fensterquote nicht rekonstruieren');
      assert.ok(block.includes('bleibt deshalb kumulativ'),
        'der Kommentar erklaert nicht, warum die Siegquote kumulativ bleibt');
    });

    it('der Kommentar traegt die gemessene Tabelle und den Grund', () => {
      const block = fensterBlock();
      assert.ok(block.includes('Toucannon'),
        'der staerkste gemessene Fall fehlt');

      /* WARUM HIER KEINE ZAHLEN MEHR VERGLICHEN WERDEN (06.09.2026).
         Dieser Fall hat den Deploy zum DRITTEN Mal blockiert. Erst stand
         6,12 % im Test (falsche Spalte), dann 4,20 % (alter Nenner);
         beide Male wurde die Zahl im Test nachgezogen. Beim dritten Mal
         stimmte der Test — und der Kommentar war alt: der Wochenlauf vom
         06.09. machte aus Toucannons 0,82 % im Fenster 0,77 %.

         Der Denkfehler steckt eine Ebene hoeher: der Kommentar sagt
         ausdruecklich "Gemessen am 05.09.2026" und ist damit eine
         DATIERTE MOMENTAUFNAHME. Sie gegen die Datei von heute zu
         halten, muss scheitern, sobald ein Lauf die Datei anfasst — also
         jede Woche. Ein Kommentar, der veraltet, ist kein Fehler; ein
         Test, der deshalb den Deploy anhaelt, schon.

         Geprueft wird deshalb ab jetzt die EIGENSCHAFT, nicht der Wert:
         die Verdrahtung steht (beide Dateien fuehren die Decks), der
         Kommentar nennt sein Messdatum, und die AUSSAGE, auf der der
         ganze Entwurf beruht, gilt weiterhin — Toucannon liegt im
         Fenster deutlich unter seinem kumulativen Anteil. Kippt das,
         faellt der Fall um; eine Nachkommastelle laesst ihn kalt. */

      const fen = lies('data/limitless_online_fenster.csv', 1);
      const ver = lies('data/limitless_online_decks_comparison.csv', 0);
      const zahl = (x) => Number(String(x).replace(',', '.'));

      for (const deck of ['Toucannon', 'Festival Lead', 'Alakazam Dudunsparce',
                          'Dragapult Dusknoir', 'Mega Excadrill']) {
        const f = fen.find(r => r.deck_name === deck);
        const v = ver.find(r => r.deck_name === deck);
        assert.ok(f && v, `${deck} steht in einer der beiden Dateien nicht mehr`);
        const zeile = block.split('\n').find(z => z.includes(deck + ' '));
        assert.ok(zeile, `${deck} fehlt in der Tabelle im Kommentar`);
        // Die Zeile muss beide Spalten fuehren — sonst ist die Tabelle
        // halb, und der Leser sieht nur eine Seite des Vergleichs.
        assert.ok(/\d+,\d\d % kumulativ/.test(zeile),
          `${deck}: die Zeile nennt keinen kumulativen Anteil — ${zeile.trim()}`);
        assert.ok(/\d+,\d\d % im Fenster/.test(zeile),
          `${deck}: die Zeile nennt keinen Fensteranteil — ${zeile.trim()}`);
      }

      // Der Kommentar muss sich als Momentaufnahme zu erkennen geben.
      assert.ok(/Gemessen am \d{2}\.\d{2}\.\d{4}/.test(block),
        'die Tabelle nennt kein Messdatum — dann liest sie sich wie ein '
        + 'Istzustand, obwohl sie eine Momentaufnahme ist');

      // Und die Aussage selbst, an den HEUTIGEN Daten: Toucannon ist der
      // Fall, um den es geht. Sein Fensteranteil muss klar unter dem
      // kumulativen liegen — sonst traegt der ganze Abschnitt nicht mehr.
      const tF = fen.find(r => r.deck_name === 'Toucannon');
      const tV = ver.find(r => r.deck_name === 'Toucannon');
      assert.ok(zahl(tF.share_fenster) < zahl(tV.new_share) * 0.75,
        `Toucannon liegt im Fenster bei ${tF.share_fenster} % und kumulativ bei `
        + `${tV.new_share} % — der Abstand traegt das Beispiel nicht mehr. Dann `
        + 'gehoert ein anderes Deck in den Kommentar, nicht eine neue Zahl.');

      assert.ok(/ladderPctDamped/.test(block),
        'der Kommentar nennt nicht, wo der Anteil in die Prognose eingeht');
      assert.ok(block.includes('keine Schaetzung') || block.includes('Subtraktion'),
        'der Kommentar sagt nicht, dass das Fenster gemessen und nicht geschaetzt ist');
    });

    it('die Kachel nennt den Nenner in beiden Sprachen', () => {
      assert.ok(QUELLE.includes("t('mc.intelOnlineShareFenster')"),
        'die Kachel traegt kein Fensteretikett');
      assert.ok(QUELLE.includes("t('mc.intelOnlineShareKumulativ')"),
        'der Kumulativstand steht nicht daneben');
      for (const key of ['mc.intelOnlineShareFenster', 'mc.intelOnlineShareKumulativ']) {
        const treffer = (I18N.match(new RegExp("'" + key.replace('.', '\\.') + "'", 'g')) || []).length;
        assert.strictEqual(treffer, 2, `${key} fehlt in einer der beiden Sprachen`);
      }
      assert.ok(/'mc\.intelOnlineShareFenster':\s*'Online-Anteil \(\{tage\} Tage\)'/.test(I18N),
        'die deutsche Beschriftung nennt die Tage nicht dynamisch');
    });

    it('ohne Fenster faellt die Kachel auf die alte Beschriftung zurueck', () => {
      assert.ok(QUELLE.includes("t('mc.intelOnlineShareToday')"),
        'der Rueckfall auf die alte Beschriftung fehlt');
      assert.ok(/if \(_fensterMeta\) \{/.test(QUELLE),
        'die Kachel unterscheidet nicht, ob ein Fenster gilt');
    });

    it('das Skript hinter der Datei laeuft im Wochenlauf', () => {
      const wf = fs.readFileSync(
        path.join(WURZEL, '.github', 'workflows', 'weekly-full-update.yml'), 'utf8');
      assert.ok(wf.includes('scripts/build_online_fenster.py --apply'),
        'die Fensterdatei wird nie neu gebaut — sie waere nach 10 Tagen tot');
      const fensterIdx = wf.indexOf('build_online_fenster.py');
      const scraperIdx = wf.indexOf('scrapers/limitless_online_scraper.py');
      assert.ok(scraperIdx > -1 && fensterIdx > scraperIdx,
        'das Fenster wird gebaut, BEVOR der Tagesstand von heute geschrieben ist');
      assert.ok(/build_online_fenster[\s\S]{0,400}?continue-on-error: true|continue-on-error: true[\s\S]{0,400}?build_online_fenster/.test(wf),
        'der Schritt ist blockierend — ein fehlender Verlauf haelt den Wochenlauf an');
    });

  it('fuenf Waechter, nicht zwei', () => {
    /* Nachgeschaerft am 05.09.2026 nach der Gegenpruefung: der
       Deckungswaechter zaehlt NAMEN. 122 Namen mit je zwei Listen
       decken sich zu 100 % und waeren durchgegangen. Und ein
       gestrecktes Fenster (fehlende Staende -> 40 statt 14 Tage) traegt
       die eigene Begruendung nicht mehr. */
    assert.ok(/FENSTER_MIN_DECKS\s*=\s*\d+/.test(QUELLE),
      'keine Untergrenze auf die Stichprobe');
    assert.ok(/FENSTER_MAX_TAGE\s*=\s*\d+/.test(QUELLE),
      'keine Obergrenze auf die Fensterlaenge');
    assert.ok(QUELLE.includes('umfang < FENSTER_MIN_DECKS'),
      'die Untergrenze wird nicht geprueft');
    assert.ok(QUELLE.includes('tage > FENSTER_MAX_TAGE'),
      'die Obergrenze wird nicht geprueft');
    /* Und eine UNTERgrenze: `Number(x) || 0` faellt bei fehlender
       Angabe auf 0, und `0 > FENSTER_MAX_TAGE` ist falsch — ohne sie
       liefe die Seite mit der Beschriftung "Online-Anteil (0 Tage)". */
    assert.ok(/FENSTER_MIN_TAGE\s*=\s*\d+/.test(QUELLE),
      'keine Untergrenze auf die Fensterlaenge');
    assert.ok(QUELLE.includes('!(tage >= FENSTER_MIN_TAGE)'),
      'eine fehlende Tagesangabe faellt offen aus');
  });

  it('der Rotationswaechter steht und kann feuern', () => {
    /* Der gefaehrlichste Fall: bei einer Rotation setzt die Quelle
       ihren Zaehler auf null, das Bauskript schreibt nichts, die ALTE
       Datei bleibt liegen. An zwoelf von 65 durchgespielten Tagen
       speiste so ein Fenster aus dem abgelaufenen Format den
       Praediktor — und Alter, Deckung, Umfang und Spanne sahen dabei
       alle in Ordnung aus, weil Decknamen eine Rotation ueberleben. */
    assert.ok(QUELLE.includes("meta.fenster_von < formatstart"),
      'kein Rotationswaechter');
    /* UND er muss feuern koennen: _formatWindow wird erst in §3
       geladen, also NACH diesem Block. Eine Pruefung gegen das
       Modulfeld waere ein Waechter, den dieser Test bestaetigt und der
       nie anschlaegt. Der Block holt format_window.json selbst. */
    const block = fensterBlock();
    assert.ok(block.includes("fetch('data/format_window.json"),
      'der Waechter liest ein Datum, das an dieser Stelle noch nicht geladen ist');
    // Ein LESENDER Zugriff, nicht die Erwaehnung im Kommentar daneben.
    assert.ok(!/_formatWindow\s*(\.|&&|\|\||\))/.test(block),
      '§1b liest _formatWindow — das ist hier noch null');
  });

  it('der haeufigste Ausfall meldet sich auch', () => {
    /* fetch loest bei 404 NORMAL auf (ok === false) — der catch greift
       dort nicht. Ohne eigenen Zweig waere ausgerechnet "Datei nicht
       ausgeliefert" der einzige stille Fall. */
    assert.ok(/if \(!fRes\.ok \|\| !fMetaRes\.ok\) \{/.test(QUELLE),
      'ein 404 auf die Fensterdatei laeuft stumm durch');
    const i = QUELLE.indexOf('if (!fRes.ok || !fMetaRes.ok) {');
    assert.ok(QUELLE.slice(i, i + 900).includes('console.warn'),
      'der Zweig sagt nichts');
  });

  it('Past Meta traegt kein Fensteretikett', () => {
    /* _pastMetaToShareList setzt ladderShare aus einer
       TURNIERaggregation. Bliebe _fensterMeta stehen, hiesse die Kachel
       weiter "Online-Anteil (14 Tage)" ueber einer Zahl, die das nicht
       ist — und die Kumulativzeile fiele weg, weil
       ladderShareKumulativ im Past-Pfad undefined ist. */
    const i = QUELLE.indexOf('no top8/conv data for past metas');
    assert.ok(i > -1, 'der Past-Meta-Ruecksetzblock ist verschwunden');
    assert.ok(QUELLE.slice(i, i + 900).includes('_fensterMeta = null;'),
      '_fensterMeta wird im Past-Pfad nicht zurueckgesetzt');
  });

  it('Trend und Surge rechnen weiter kumulativ', () => {
    /* DER Befund der Gegenpruefung. majSnap, wkSnap und
       _computeWeightedBaseline lesen alle die share-Spalte aus
       online_share_history — die ist KUMULATIV. Traegt nur die linke
       Seite den Fensterwert, misst die Differenz den Nennersprung: der
       Clip in _trendSignal saettigte nachgerechnet bei 68 von 129 Decks
       statt bei 9, und Predictor 4.0a meldete drei Surge-Decks, von
       denen keines gestiegen war — jeder KONTER dieser drei haette
       einen Aufschlag bekommen. */
    assert.ok(/function _kumulativAnteil\(d\)/.test(QUELLE),
      'der Helfer fuer den kumulativen Anteil fehlt');
    assert.ok(QUELLE.includes('_trendSignal(ladderPctKum, majBaselinePct)'),
      'das Major-Trendsignal rechnet Fenster gegen Kumulativ');
    assert.ok(QUELLE.includes('_trendSignal(ladderPctKum, weightedBaselinePct)')
           && QUELLE.includes('_trendSignal(ladderPctKum, wkBaselinePct)'),
      'das Wochen-Trendsignal rechnet Fenster gegen Kumulativ');
    assert.ok(QUELLE.includes('_kumulativAnteil(d) / totalLadderKumSurge'),
      'Predictor 4.0a rechnet Fenster gegen einen kumulativen Snapshot');
    /* Ohne Fenster muss der Helfer exakt das alte Verhalten liefern —
       sonst waere die Reparatur selbst eine Aenderung am Motor. */
    assert.ok(/d\.ladderShareKumulativ != null\) \? d\.ladderShareKumulativ : \(d\.ladderShare \|\| 0\)/.test(QUELLE),
      'ohne Fenster liefert der Helfer nicht denselben Wert wie vorher');
  });

  it('die Trendkachel liest dieselbe Uhr wie der Anteil', () => {
    /* BEFUND beim Ansehen der ausgelieferten Seite (05.09.2026): neben
       "Online-Anteil (14 Tage) 6,4 %" stand "Trend (7 Tage) -0,0 %".
       `d.trend` ist die Wochenbewegung des KUMULATIVSTANDS und damit um
       Groessenordnungen traeger — mittlerer Betrag 0,019 pp gegen
       0,181 pp im Fenster, fuer Mega Excadrill -0,03 gegen -1,88. */
    assert.ok(QUELLE.includes('d.trendFenster = (tf == null) ? undefined : tf;'),
      'der Fenstertrend wird beim Laden nicht mitgenommen');
    assert.ok(QUELLE.includes("t('mc.intelTrendFenster')"),
      'die Kachel traegt kein Fensteretikett fuer den Trend');
    assert.ok(QUELLE.includes("t('mc.intelTrend7d')"),
      'der Rueckfall auf den Wochentrend fehlt');
    /* LEER IST NICHT NULL: eine Zeile ohne messbaren Trend darf nicht
       als "keine Bewegung" durchgehen. */
    assert.ok(/String\(r\.trend_fenster \|\| ''\)\.trim\(\) !== ''/.test(QUELLE),
      'ein leeres Trendfeld wird als 0 gelesen');
    assert.ok(/typeof entry\.trendFenster === 'number'/.test(QUELLE),
      'die Kachel unterscheidet nicht zwischen fehlendem und null');
    /* Pfeil, Vorzeichen und Farbe muessen aus DER ZAHL kommen, die die
       Kachel zeigt. Vorher standen sie oben und rechneten immer mit dem
       Wochentrend — ein Deck mit -1,88 im Fenster haette einen
       Aufwaertspfeil bekommen, wenn der Wochentrend positiv war. */
    // `trendSign` allein wuerde auch `_trendSignal` treffen — das ist
    // der Trendterm der Prognose und bleibt absichtlich stehen.
    assert.ok(!/\btrendArrow\b|\btrendSign\b(?!al)|\btrendCls\b/.test(QUELLE),
      'Pfeil/Vorzeichen/Farbe kommen wieder aus dem Wochentrend');
    for (const key of ['mc.intelTrendFenster']) {
      const n = (I18N.match(new RegExp("'" + key.replace('.', '\\.') + "'", 'g')) || []).length;
      assert.strictEqual(n, 2, `${key} fehlt in einer der beiden Sprachen`);
    }
  });

  it('der Praediktor rechnet weiter mit dem Wochentrend', () => {
    /* BEWUSST NICHT MITGEAENDERT. `0.10 * trendPct` ist auf dem
       kumulativen Wochentrend kalibriert; ein zwanzigfach groesserer
       Term waere eine Modelaenderung und keine Anzeigekorrektur. Diese
       Zusage haelt die Trennung fest, damit sie nicht versehentlich
       faellt. */
    assert.ok(/0\.10 \* trendPct/.test(QUELLE),
      'der Trendterm der Prognose wurde mitgeaendert — das ist eine '
      + 'Modelaenderung und braucht ihre eigene Messung');
    const block = fensterBlock();
    assert.ok(!/trendPct/.test(block),
      '§1b fasst den Prognose-Trendterm an');
  });
});
