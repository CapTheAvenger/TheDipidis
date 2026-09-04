/* ══════════════════════════════════════════════════════════════════════
 * DIE DATENQUELLEN DER POST-VORLAGEN
 * ══════════════════════════════════════════════════════════════════════
 *
 * Diese Zusicherungen laufen gegen die ECHTEN Dateien in data/, nicht
 * gegen Ausschnitte. Der Grund steht in der Pocket-Abnahme vom
 * 04.09.2026: ein Ausschnitt, den man sich selbst zurechtschneidet,
 * belegt die eigene Annahme statt der Datei.
 *
 * WARUM DAS HIER SCHÄRFER SEIN MUSS ALS SONST
 * -------------------------------------------
 * Was diese Datei erzeugt, wird zu einem PNG und wandert durch
 * Instagram. Dort gibt es keine Fußnote, keinen Tooltip und keine
 * Korrektur. Ein falscher Nenner auf der Seite ist ein Fehler; ein
 * falscher Nenner auf einem geposteten Bild ist eine Behauptung.
 *
 * tests/unit/test-post-vorlagen.js prüft die GESTALTUNG gegen
 * js/ds-share.js. Diese Datei prüft die RECHNUNG. Beide gehören nicht
 * zusammen.
 * ══════════════════════════════════════════════════════════════════ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const D = (p) => path.join(WURZEL, p);

/* Ein Fenster, das genug kann: fetch aus dem Dateisystem, sonst nichts.
 * Genau so läuft die Post-Seite auch — ohne Anwendungsrahmen. */
function fenster() {
    const ctx = { console };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.fetch = function (u) {
        const p = D(String(u).replace(/^\.\.\//, ''));
        const da = fs.existsSync(p);
        return Promise.resolve({
            ok: da,
            status: da ? 200 : 404,
            text: () => Promise.resolve(fs.readFileSync(p, 'utf8')),
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')))
        });
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(D('js/matchup-glaettung.js'), 'utf8'), ctx,
                    { filename: 'matchup-glaettung.js' });
    vm.runInContext(fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8'), ctx,
                    { filename: 'ds-post-quellen.js' });
    return ctx;
}

const Q = fenster().window.DsPostQuellen;

function zeilenVon(erg) {
    return String(erg.zeilen || '').split('\n').filter(Boolean).map((z) => {
        const t = z.split('|');
        return { name: t[0].trim(), wert: (t[1] || '').trim() };
    });
}

/* ── Der Leser ────────────────────────────────────────────────────── */

test('der Leser nimmt das BOM weg', () => {
    const roh = fs.readFileSync(D('data/limitless_online_decks.csv'));
    assert.equal(roh[0], 0xEF, 'die Datei hat kein BOM mehr — dann prüft dieser ' +
        'Test den Fall nicht mehr, den er festhalten soll');
    const zeilen = Q.liesCsv(roh.toString('utf8'), ';');
    assert.ok(Object.prototype.hasOwnProperty.call(zeilen[0], 'rank'),
        'der erste Kopfschlüssel heißt nicht "rank" — das BOM klebt noch dran: ' +
        JSON.stringify(Object.keys(zeilen[0]).slice(0, 2)));
});

test('der Leser nimmt das CR am Zeilenende weg', () => {
    const text = fs.readFileSync(D('data/limitless_online_decks.csv'), 'utf8');
    assert.ok(text.includes('\r\n'), 'die Datei hat keine CRLF mehr');
    const zeilen = Q.liesCsv(text, ';');
    zeilen.slice(0, 5).forEach((z) => {
        Object.keys(z).forEach((k) => {
            assert.ok(!/[\r\n]/.test(z[k]),
                `ein Zeilenumbruch steht im Feld ${k}: ${JSON.stringify(z[k])}`);
        });
    });
});

test('ein Komma IN Anfuehrungszeichen trennt keine Spalte', () => {
    /* Der Fehler, der in js/app-archetype-card.js:218 mit dem
     * 404,5-%-Befund dokumentiert ist. */
    const text = fs.readFileSync(D('data/labs_tournament_decks_TEF-PBL.csv'), 'utf8');
    const mitAnf = text.split(/\r?\n/).filter((z) => z.includes('"')).length;
    assert.ok(mitAnf >= 20,
        `nur ${mitAnf} Zeilen mit Anführungszeichen — dann prüft dieser Test ` +
        'den Pfad nicht mehr');
    const zeilen = Q.liesCsv(text, ',');
    zeilen.forEach((z) => {
        assert.ok(/^\d+$/.test(z.player_count),
            `player_count ist keine ganze Zahl: ${JSON.stringify(z.player_count)} ` +
            `bei ${z.deck_name} — die Spalten sind verschoben`);
        assert.ok(parseFloat(String(z.share_pct).replace(',', '.')) <= 100,
            `share_pct über 100 bei ${z.deck_name}: ${z.share_pct}`);
    });
});

test('das Dezimalkomma wird gelesen, nicht abgeschnitten', () => {
    assert.equal(Q.zahlAus('7,42'), 7.42);
    assert.equal(Q.zahlAus('53,7'), 53.7);
    assert.equal(Q.zahlAus('7.49%'), 7.49);
    assert.notEqual(Q.zahlAus('7,42'), 7,
        'parseFloat("7,42") gibt 7 — genau dieser Fehler ist auf der Seite ' +
        'schon einmal passiert');

    /* DEUTSCHER TAUSENDERPUNKT (zweite Abnahme, 04.09.2026).
     * `.replace(',', '.')` ersetzt nur das ERSTE Vorkommen und liess den
     * Punkt stehen: parseFloat("1.234.5") = 1.234. Faktor tausend. Die
     * Form kommt in data/ heute nicht vor — total_games steht aber schon
     * bei 1280, und die limitless-Dateien schreiben deutsch. Deshalb an
     * gesetzten Werten, nicht an der Datei. */
    assert.equal(Q.zahlAus('1.234,5'), 1234.5,
        'ein deutscher Tausenderpunkt wurde als Dezimalpunkt gelesen — Faktor tausend');
    assert.equal(Q.zahlAus('12.345'), 12.345,
        'ohne Komma ist der Punkt das Dezimalzeichen (englische Spalte)');
    /* Innere Leerzeichen duerfen nicht zusammenkleben. */
    assert.notEqual(Q.zahlAus('12 34'), 1234,
        '"12 34" wurde zu 1234 zusammengeklebt');
});

test('eine fehlende Zahl wird gemeldet, nicht als "NaN" gemalt', () => {
    /* `tausend(NaN)` gab den String "NaN" zurueck, und im Bild stand
     * "aus NaN Listen" — der Fehlerpfad der Oberflaeche griff nicht,
     * weil das Versprechen aufloeste (zweite Abnahme, 04.09.2026). */
    assert.throws(() => Q.tausend(NaN),
        'tausend(NaN) wirft nicht — dann steht "NaN" auf dem Bild');
    assert.throws(() => Q.tausend(undefined));
    assert.equal(Q.tausend(39842), '39.842');
});

/* ── Der Nenner ───────────────────────────────────────────────────── */

test('der Nenner ist die erfasste Spielerzahl, nicht die Summe der Zeilen', async () => {
    /* DER TEURE FEHLER (04.09.2026).
     * Summe der Spalte count = 38.398, erfasste Spieler = 39.842.
     * 1.444 Spieler stehen in keiner Deckzeile, und es gibt kein
     * "Other". Mit der Summe als Nenner zeigt der Post 7,77 % statt
     * 7,49 %. */
    const stat = JSON.parse(fs.readFileSync(D('data/limitless_meta_stats.json'), 'utf8'));
    const roh = Q.liesCsv(fs.readFileSync(D('data/limitless_online_decks.csv'), 'utf8'), ';');
    const summe = roh.reduce((a, r) => a + (Q.zahlAus(r.count) || 0), 0);
    assert.ok(Math.abs(summe - stat.players) > 100,
        'Summe und erfasste Spielerzahl liegen beieinander — dann prüft dieser ' +
        `Test die Lücke nicht mehr (${summe} vs. ${stat.players})`);

    const erg = await Q.lade('meta-online');
    assert.ok(erg.fuss.includes(Q.tausend(stat.players)),
        `die Fußzeile nennt nicht ${Q.tausend(stat.players)}: ${erg.fuss}`);
    assert.ok(!erg.fuss.includes(Q.tausend(summe)),
        `die Fußzeile nennt die Summe der Zeilen (${Q.tausend(summe)}) als Nenner: ` +
        erg.fuss);
});

test('der Anteil ist der aus der Datei, nicht der nachgerechnete', async () => {
    const roh = Q.liesCsv(fs.readFileSync(D('data/limitless_online_decks.csv'), 'utf8'), ';');
    const erste = roh.filter((r) => Q.zahlAus(r.share_numeric) > 0)
        .sort((a, b) => Q.zahlAus(b.share_numeric) - Q.zahlAus(a.share_numeric))[0];
    const erg = await Q.lade('meta-online');
    const z = zeilenVon(erg)[0];
    assert.equal(z.name, erste.deck_name);
    assert.equal(z.wert, Q.prozent(Q.zahlAus(erste.share_numeric), 2),
        `der Anteil weicht von der Spalte share_numeric ab: ${z.wert} statt ` +
        Q.prozent(Q.zahlAus(erste.share_numeric), 2));
});

test('jede Quelle schreibt eine Zahl in ihre Fusszeile', async () => {
    /* Die Hausregel als Zusicherung — die eine, die auf eine zehnte
     * Quelle skaliert. */
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        assert.ok(/\d/.test(erg.fuss),
            `${e.name} hat keine Zahl in der Fußzeile: ${JSON.stringify(erg.fuss)}`);
        assert.ok(erg.listeKopf && erg.listeKopf.length,
            `${e.name} hat keinen Spaltenkopf`);
    }
});

/* ── Was nicht auf das Bild darf ──────────────────────────────────── */

test('keine Zombie-Zeile kommt in die Ausgabe', async () => {
    const roh = Q.liesCsv(fs.readFileSync(D('data/limitless_online_decks.csv'), 'utf8'), ';');
    const zombies = roh.filter((r) => r.deck_name && Q.zahlAus(r.share_numeric) === 0);
    assert.ok(zombies.length >= 1,
        'die Datei enthält keine Zeile mit share=0 mehr — dann kann dieser Test ' +
        'leer bestehen und prüft nichts');
    const erg = await Q.lade('meta-online');
    const namen = zeilenVon(erg).map((z) => z.name);
    zombies.forEach((z) => {
        assert.ok(!namen.includes(z.deck_name),
            `${z.deck_name} steht mit share=0 in der Ausgabe`);
    });
});

test('die Worlds-Quelle nimmt nicht die Spalte win_pct', async () => {
    /* win_pct fuehrt Matchpunkte (3S+U)/3n. Dragapult steht dort mit
     * 46,41; die Siegquote ist 541/1277 = 42,4. Vier Punkte, und sie
     * tragen verschiedene Geschichten. */
    const roh = Q.liesCsv(fs.readFileSync(D('data/labs_tournament_decks_TEF-PBL.csv'), 'utf8'), ',');
    const gross = roh.filter((r) => r.deck_name && r.deck_name !== 'Other')
        .sort((a, b) => Q.zahlAus(b.player_count) - Q.zahlAus(a.player_count))[0];
    const w = Q.zahlAus(gross.wins), l = Q.zahlAus(gross.losses), u = Q.zahlAus(gross.ties);
    const echt = 100 * w / (w + l + u);
    const spalte = Q.zahlAus(gross.win_pct);
    assert.ok(Math.abs(echt - spalte) > 1,
        `win_pct (${spalte}) und Siegquote (${echt.toFixed(2)}) liegen beieinander — ` +
        'dann prüft dieser Test die Falle nicht mehr');

    const erg = await Q.lade('worlds-tag1');
    const z = erg.zahlFuer(gross.deck_name);
    assert.ok(z.zahlNenner.includes(Q.prozent(echt, 1)),
        `der Nenner nennt nicht die echte Siegquote ${Q.prozent(echt, 1)}: ${z.zahlNenner}`);
    assert.ok(!z.zahlNenner.includes(Q.prozent(spalte, 1)),
        `der Nenner trägt die Matchpunkte aus win_pct: ${z.zahlNenner}`);
});

test('die Top-8-Quelle malt keine Abweichung vom Feldschnitt', async () => {
    /* DER SCHWERSTE BEFUND DER ABNAHME (04.09.2026).
     * `computeConversionPerformance().perfPct` ist die relative
     * Abweichung vom Feldschnitt, keine Quote. Dragapult Blaziken steht
     * dort bei +68,0 %; die echte Top-8-Quote ist 10,7 %. Faktor sechs
     * auf einem Bild, das niemand nachschlagen kann.
     *
     * Derselbe Fehler ist in js/ds-share.js:520 fuer die Staples
     * festgehalten: "META GESAMT 7.178 WAR EINE FALSCHE BESCHRIFTUNG
     * […] Faktor fuenf." */
    const roh = Q.liesCsv(fs.readFileSync(D('data/online_tournament_top8_decks.csv'), 'utf8'), ';');
    let gA = 0, gT = 0;
    roh.forEach((r) => {
        gA += Q.zahlAus(r.total_brought_weighted) || 0;
        gT += Q.zahlAus(r.top8_count_weighted) || 0;
    });
    const feld = 100 * gT / gA;
    assert.ok(feld > 0 && feld < 100, `Feldschnitt unplausibel: ${feld}`);

    const erg = await Q.lade('top8');
    /* GLEICHUNG STATT BAND (zweite Abnahme, 04.09.2026).
     *
     * Die erste Fassung prueft "0 <= n <= 100" und "kein Pluszeichen".
     * Beides erfuellt die ABWEICHUNG ebenfalls: sie liegt fuer die
     * Spitzendecks bei 44 bis 99, und `prozent()` schreibt nie ein Plus.
     * Die Zusicherung, die genau gegen diesen Fehler geschrieben wurde,
     * konnte ihn strukturell nicht fangen — dieselbe Bauart, die diese
     * Datei bei der alten Zombie-Zusicherung selbst verwirft.
     *
     * Jetzt wird jeder gezeigte Wert gegen die Datei nachgerechnet. */
    zeilenVon(erg).forEach((z) => {
        const zeile = roh.filter((r) => r.deck_name === z.name)[0];
        assert.ok(zeile, `${z.name} steht nicht in der Datei`);
        const quote = 100 * Q.zahlAus(zeile.top8_count_weighted) /
                            Q.zahlAus(zeile.total_brought_weighted);
        assert.equal(z.wert, Q.prozent(quote, 1),
            `${z.name} traegt ${z.wert}, die echte Top-8-Quote ist ` +
            `${Q.prozent(quote, 1)} (die Abweichung vom Feldschnitt waere ` +
            `${Q.prozent(100 * (quote / feld - 1), 1)})`);
    });
    assert.ok(erg.fuss.includes(Q.prozent(feld, 1)),
        `der Feldschnitt ${Q.prozent(feld, 1)} steht nicht auf dem Bild: ${erg.fuss}`);
});

test('die Top-8-Quelle haelt ihre Mindeststichprobe ein', async () => {
    const MIN = 20;
    const roh = Q.liesCsv(fs.readFileSync(D('data/online_tournament_top8_decks.csv'), 'utf8'), ';');
    const duenn = roh.filter((r) => {
        const a = Q.zahlAus(r.total_brought_weighted);
        return isFinite(a) && a < MIN;
    });
    assert.ok(duenn.length >= 10,
        `nur ${duenn.length} Zeilen unter ${MIN} Antritten — dann prüft dieser ` +
        'Test die Schwelle nicht mehr');
    const erg = await Q.lade('top8');
    const namen = zeilenVon(erg).map((z) => z.name);
    duenn.forEach((r) => {
        assert.ok(!namen.includes(r.deck_name),
            `${r.deck_name} steht mit ${r.total_brought_weighted} gewichteten ` +
            'Antritten in der Ausgabe');
    });
});

test('Champions zeigt einen Bruch, keine Balkenlaenge', async () => {
    /* `rankTeams().share` ist count/max — Kingambit steht dort bei 1.0.
     * Der Anteil ist 48 von 114 = 42,1 %. Wer die Balkenlaenge malt,
     * schreibt "100 %" ueber ein Pokemon, das in 58 % der Teams NICHT
     * vorkommt. */
    const d = JSON.parse(fs.readFileSync(D('data/champions_replica_teams.json'), 'utf8'));
    const erg = await Q.lade('champions');
    const erste = zeilenVon(erg)[0];
    assert.ok(erste.wert.includes(' von ' + d.teams.length),
        `der Wert nennt nicht die Teamzahl: ${erste.wert}`);
    assert.ok(!/100\s*%/.test(erste.wert),
        `der Wert ist eine Balkenlänge und keine Häufigkeit: ${erste.wert}`);
    assert.ok(/\d+ Turniere/.test(erg.fuss),
        `die Fußzeile sagt nicht, aus wie vielen Turnieren die Teams stammen: ${erg.fuss}`);
});

test('Staples zaehlt Archetypen und nennt sie so', async () => {
    const erg = await Q.lade('staples');
    assert.ok(/Archetypen/.test(erg.listeKopf) && /Archetypen/.test(erg.fuss),
        'weder Spaltenkopf noch Fußzeile nennen den Nenner "Archetypen" — ' +
        `"100 % der Decks" wäre falsch: ${erg.listeKopf} / ${erg.fuss}`);
    zeilenVon(erg).forEach((z) => {
        assert.ok(/^\d+ von \d+$/.test(z.wert),
            `${z.name} traegt "${z.wert}" statt eines Bruchs`);
    });
    assert.ok(/Meta Live/.test(erg.fuss),
        'die Fußzeile sagt nicht, welches Meta gezählt wurde — die Datei mischt zwei');
});

test('gleiche Werte in einer Liste bekommen keine Rangziffern', async () => {
    /* Live gefunden: "03 Basculegion | 41 von 114" ueber "04 Charizard |
     * 41 von 114" — sortiert nach Alphabet, gemalt als Rangfolge. */
    let gepruefte = 0;
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        const decks = erg.proDeck ? erg.decks : [null];
        for (const d of decks) {
            const q = erg.proDeck ? erg.proDeck(d) : erg;
            const werte = zeilenVon(q).map((z) => z.wert);
            if (new Set(werte).size !== werte.length) {
                gepruefte++;
                assert.equal(q.ohneRang, true,
                    `${e.name}${d ? ' / ' + d : ''}: die Werte ` +
                    `${JSON.stringify(werte)} enthalten Doppelungen, die ` +
                    'Rangziffern behaupten trotzdem eine Ordnung');
            }
            if (!erg.proDeck) break;
        }
    }
    assert.ok(gepruefte >= 1,
        'keine einzige Liste hat heute doppelte Werte — dann prueft dieser ' +
        'Test nichts');
});

test('Pocket schneidet keine Stufe an und erfindet keine Rangfolge', async () => {
    /* Innerhalb einer Stufe gibt es keine Ordnung. Acht Zeilen fielen
     * mitten in A+ (S=4, A+=5) und liessen ein gleich eingestuftes Deck
     * weg — auf einem Bild ohne Fussnote heisst das "schlechter". */
    const d = JSON.parse(fs.readFileSync(D('data/pocket_tierlist.json'), 'utf8'));
    const erg = await Q.lade('pocket');
    const gezeigt = zeilenVon(erg);
    const stufen = {};
    gezeigt.forEach((z) => { stufen[z.wert] = (stufen[z.wert] || 0) + 1; });
    Object.keys(stufen).forEach((st) => {
        const inDatei = d.decks.filter((x) => x.tier === st).length;
        assert.equal(stufen[st], inDatei,
            `Stufe ${st} ist angeschnitten: ${stufen[st]} von ${inDatei} gezeigt`);
    });
    assert.equal(erg.ohneRang, true,
        'Pocket bestellt die Rangziffern nicht ab — 01/02 wäre eine Ordnung, ' +
        'die in der Quelle nicht existiert');
    assert.ok(/Game8/.test(erg.fuss) && /nicht gemessen/.test(erg.fuss),
        '_meta.quelle_hinweis verlangt, dass die Oberfläche die redaktionelle ' +
        `Herkunft anschreibt: ${erg.fuss}`);
});

test('die Day-2-Prognose nennt sich Prognose und haelt ihre Schwelle', async () => {
    const d = JSON.parse(fs.readFileSync(D('data/deckempfehlung.json'), 'utf8'));
    const erg = await Q.lade('day2-prognose');
    assert.ok(/Prognose/i.test(erg.fuss) || /Prognose/i.test(erg.kicker),
        `weder Fußzeile noch Kicker nennen es eine Prognose: ${erg.fuss}`);
    const namen = zeilenVon(erg).map((z) => z.name);
    /* Die vollstaendige Rangliste beginnt mit Crustle auf zwanzig
     * Spielern — genau die Falle, gegen die die Schwelle gebaut ist. */
    (d.rangliste_vollstaendig || []).forEach((r) => {
        if (r.ankerspieler < (d.min_ankerspieler_anzeige || 30)) {
            assert.ok(!namen.includes(r.deck),
                `${r.deck} steht mit ${r.ankerspieler} Ankerspielern in der Ausgabe`);
        }
    });
});

/* ── Was in die Felder passt ──────────────────────────────────────── */

test('kein Wert ist laenger als die Wertspalte', async () => {
    /* `malListe` clippt den Wert auf 260 px bei Mono 34/700 — gemessen
     * genau zwoelf Zeichen (jedes 20,4 px). Was darueber steht, wird
     * stumm abgeschnitten. Die Spalte war bis zur zweiten Abnahme am
     * 04.09.2026 nur 220 px breit; "52 % · 1049" passte nicht. */
    const GRENZE = 12;
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        zeilenVon(erg).forEach((z) => {
            assert.ok(z.wert.length <= GRENZE,
                `${e.name}: "${z.wert}" hat ${z.wert.length} Zeichen, die Spalte ` +
                `fasst ${GRENZE} — es würde stumm abgeschnitten`);
        });
    }
});

test('keine Fusszeile und kein Spaltenkopf laeuft ueber', async () => {
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        assert.ok(erg.fuss.length <= 48,
            `${e.name}: die Fußzeile hat ${erg.fuss.length} Zeichen (Grenze 48): ` +
            erg.fuss);
        assert.ok(erg.listeKopf.length <= 23,
            `${e.name}: der Spaltenkopf hat ${erg.listeKopf.length} Zeichen ` +
            `(Grenze 23): ${erg.listeKopf}`);
    }
});

test('der Nenner der Zahl-Vorlage passt in zwei Zeilen', async () => {
    /* `malZahl` wirft die dritte Zeile OHNE Auslassungszeichen weg. */
    for (const e of Q.liste()) {
        const erg = await Q.lade(e.id);
        if (!erg.zahlFuer || !erg.decks) continue;
        const z = erg.zahlFuer(erg.decks[0]);
        if (!z) continue;
        const zeilen = String(z.zahlNenner).split('\n');
        assert.ok(zeilen.length <= 2,
            `${e.name}: der Nenner hat ${zeilen.length} Zeilen — die dritte fällt ` +
            'ohne Auslassungszeichen weg');
        zeilen.forEach((zl) => {
            assert.ok(zl.length <= 60,
                `${e.name}: "${zl}" hat ${zl.length} Zeichen, die Zeile fasst rund 56`);
        });
        assert.ok(/\d/.test(z.zahlNenner),
            `${e.name}: der Pflicht-Nenner der Zahl-Vorlage trägt keine Zahl`);
    }
});

test('jede Quote steht mit deutschem Dezimalkomma da', async () => {
    /* Der Test, der ein fehlendes window.getLang faengt: formatPercent
     * faellt sonst auf "7.5%" zurueck — englischer Punkt in einem
     * deutschen Post. */
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        zeilenVon(erg).forEach((z) => {
            assert.ok(!/\d\.\d/.test(z.wert),
                `${e.name}: "${z.wert}" trägt einen englischen Dezimalpunkt`);
        });
        assert.ok(!/\d\.\d\s*%/.test(erg.fuss),
            `${e.name}: die Fußzeile trägt einen englischen Dezimalpunkt: ${erg.fuss}`);
    }
});

test('jede Quelle bringt eine Bildunterschrift mit', async () => {
    for (const e of Q.liste()) {
        let erg = await Q.lade(e.id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        assert.ok(erg.caption && erg.caption.trim(),
            `${e.name} hat keine Bildunterschrift`);
        assert.ok(/\d/.test(erg.caption),
            `${e.name}: die Bildunterschrift trägt keine Zahl — dann muss der ` +
            'Betreiber sie doch wieder abtippen');
    }
});

/* ── Die Seite selbst ─────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════
 * ZWEITE ABNAHME (04.09.2026)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ein Pruefagent hat 22 Mutationen in den Produktivcode gesetzt. ELF
 * blieben gruen — darunter ALLE SECHS vertauschten Sortierungen, der
 * entfernte Zombie-Filter, ein auf 700 gesetzter Worlds-Nenner und eine
 * Glaettung, die jede Zeile auf 50 % zog.
 *
 * Die Zusicherungen darunter schliessen genau diese Luecken. Sie sind
 * nach dem Muster gebaut, das die erste Runde als tragfaehig erwiesen
 * hat: gegen die echten Dateien rechnen, nicht gegen den Quelltext.
 * ══════════════════════════════════════════════════════════════════ */

/* Welche Rezepte eine Rangfolge behaupten, und wonach sie sortieren.
 * `wert` liest den Sortierschluessel aus der Zeile, wie sie im Bild
 * steht — nicht aus dem Rezept. */
const SORTIERT = {
    'meta-online':   (z) => Q.zahlAus(z.wert),
    'worlds-tag1':   (z) => Q.zahlAus(z.wert),
    'top8':          (z) => Q.zahlAus(z.wert),
    'staples':       (z) => Q.zahlAus(z.wert.split(' von ')[0]),
    'champions':     (z) => Q.zahlAus(z.wert.split(' von ')[0]),
    'day2-prognose': (z) => Q.zahlAus(z.wert),
    'tag2':          (z) => {
        const t = z.wert.split(' von ');
        return Q.zahlAus(t[0]) / Q.zahlAus(t[1]);
    },
    'matchups-online': (z) => Q.zahlAus(z.wert.split(' % ')[0])
};

test('jede Liste ist sortiert, wie ihr Spaltenkopf es behauptet', async () => {
    /* Es gab bis zum 04.09.2026 KEINE einzige Sortier-Zusicherung. Sechs
     * Rezepte behaupten im Spaltenkopf eine Ordnung; man konnte alle
     * sechs umdrehen, ohne dass ein Test rot wurde. */
    for (const id of Object.keys(SORTIERT)) {
        let erg = await Q.lade(id);
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        const werte = zeilenVon(erg).map(SORTIERT[id]);
        assert.ok(werte.length >= 2, `${id}: zu wenige Zeilen zum Pruefen`);
        werte.forEach((w) => assert.ok(isFinite(w),
            `${id}: ein Wert laesst sich nicht als Zahl lesen`));
        for (let i = 1; i < werte.length; i++) {
            assert.ok(werte[i] <= werte[i - 1] + 1e-9,
                `${id}: Zeile ${i + 1} (${werte[i]}) steht ueber Zeile ${i} ` +
                `(${werte[i - 1]}) — die Liste ist nicht absteigend sortiert`);
        }
    }
});

test('die Matchups sind wirklich geglaettet, nicht nur so beschriftet', async () => {
    /* DER SCHWERSTE BEFUND DER ZWEITEN ABNAHME.
     *
     * Der erste Aufruf lautete ausEintrag({win_rate, total_games}) und
     * griff zweimal daneben: die Funktion liest `record`, und sie gibt
     * eine ZAHL zurueck, kein Objekt. Ergebnis: die Rohwerte standen im
     * Bild, unter einer Fusszeile mit "geglaettet k=20". Blaziken
     * Zoroark zeigte "Raging Bolt Ogerpon | 100 % · 3".
     *
     * Beide naheliegenden Einzeilen-Reparaturen liessen die damalige
     * Suite gruen. Diese Zusicherung faellt bei beiden. */
    const erg = await Q.lade('matchups-online');
    const text = fs.readFileSync(D('data/limitless_online_decks_matchups.csv'), 'utf8');
    const roh = Q.liesCsv(text, ';');

    /* Es MUSS duenne Paarungen mit extremer Rohquote geben, sonst prueft
     * dieser Test nichts. */
    const duenn = roh.filter((r) => Q.zahlAus(r.total_games) <= 6 &&
                                    Q.zahlAus(r.win_rate) >= 95);
    assert.ok(duenn.length >= 5,
        `nur ${duenn.length} duenne Paarungen ueber 95 % — dann prueft dieser ` +
        'Test die Glaettung nicht mehr');

    let geprueft = 0;
    for (const deck of erg.decks) {
        zeilenVon(erg.proDeck(deck)).forEach((z) => {
            const t = z.wert.split(' % · ');
            const quote = Q.zahlAus(t[0]), partien = Q.zahlAus(t[1]);
            assert.ok(quote < 100,
                `${deck} → ${z.name}: ${z.wert} — 100 % gehen nicht durch die ` +
                'Glaettung, das ist ein Rohwert unter einer Glaettungs-Fussnote');
            if (partien <= 6) {
                /* Bei sechs Partien zieht k=20 hart zur Mitte: mehr als
                 * 70 % ist danach nicht mehr moeglich. */
                assert.ok(quote <= 70,
                    `${deck} → ${z.name}: ${z.wert} auf ${partien} Partien — ` +
                    'so hoch kommt nichts durch eine Glaettung mit k=20');
                geprueft++;
            }
        });
    }
    assert.ok(geprueft >= 3,
        `nur ${geprueft} duenne Zeilen erreichten eine Ausgabe — dann laeuft ` +
        'diese Pruefung weitgehend leer');
});

test('ein Bild zeigt ein Turnier, nicht mehrere', async () => {
    /* BEFUND: Nenner, Name und Datum kamen aus Zeile 0, die Deckzeilen
     * aus der ganzen Datei. TEF-PBL hat heute ein Turnier — ELF DER
     * VIERZEHN Epochendateien haben zwei bis neun. Nachgestellt mit
     * TEF-POR: "Dragapult | 389" unter dem Kopf "Spieler · von 485",
     * wobei 389 aus Indianapolis stammt und 485 Limas Feld ist. Der Post
     * haette 80,2 % behauptet statt 20,0 %. */
    const roh = Q.liesCsv(
        fs.readFileSync(D('data/labs_tournament_decks_TEF-PBL.csv'), 'utf8'), ',');
    const proTurnier = {};
    roh.forEach((r) => {
        if (!r.tournament_id) return;
        proTurnier[r.tournament_id] = (proTurnier[r.tournament_id] || 0) + 1;
    });

    for (const id of ['worlds-tag1', 'tag2']) {
        const erg = await Q.lade(id);
        const namen = zeilenVon(erg).map((z) => z.name);
        assert.equal(new Set(namen).size, namen.length,
            `${id}: ein Deck steht zweimal in der Liste — das passiert, wenn ` +
            'Zeilen aus mehreren Turnieren gemischt werden');
    }

    /* Die Summe der gezeigten Spielerzahlen darf den genannten Nenner
     * nicht ueberschreiten. Beim Mischen tat sie genau das. */
    const erg = await Q.lade('worlds-tag1');
    const nenner = Q.zahlAus(erg.listeKopf.split(' von ')[1]);
    const summe = zeilenVon(erg).reduce((a, z) => a + Q.zahlAus(z.wert), 0);
    assert.ok(summe <= nenner,
        `die acht gezeigten Decks haben zusammen ${summe} Spieler, der Nenner ` +
        `im Kopf ist ${nenner} — hier sind Turniere gemischt`);

    /* Und der Nenner ist der des Turniers, dessen Zeilen gezeigt werden. */
    const erste = zeilenVon(erg)[0];
    const zeile = roh.filter((r) => r.deck_name === erste.name)
        .sort((a, b) => Q.zahlAus(b.player_count) - Q.zahlAus(a.player_count))[0];
    assert.equal(Q.zahlAus(zeile.player_count), Q.zahlAus(erste.wert),
        `${erste.name} steht mit ${erste.wert} im Bild, die Datei sagt ` +
        `${zeile.player_count}`);
    assert.equal(Q.zahlAus(zeile.total_players), nenner,
        `der Nenner ${nenner} gehoert nicht zu dem Turnier, aus dem die erste ` +
        `Zeile stammt (${zeile.total_players})`);
});

test('kein Kicker nennt ein anderes Turnier als die Fusszeile', async () => {
    /* Kicker und Titel waren fest auf "Worlds San Francisco" verdrahtet,
     * die Fusszeile kam aus der Datei. Beim Nachstellen mit TEF-POR
     * standen zwei verschiedene Turniere auf einem Bild. */
    const roh = Q.liesCsv(
        fs.readFileSync(D('data/labs_tournament_decks_TEF-PBL.csv'), 'utf8'), ',');
    const name = roh[0].tournament_name;
    const kern = name.replace(/^World Championship\s+/i, '').trim();
    for (const id of ['worlds-tag1', 'tag2']) {
        const erg = await Q.lade(id);
        assert.ok(erg.kicker.includes(kern),
            `${id}: der Kicker "${erg.kicker}" nennt nicht das Turnier aus der ` +
            `Datei ("${kern}")`);
        assert.ok(erg.fuss.includes(kern),
            `${id}: die Fusszeile "${erg.fuss}" nennt ein anderes Turnier`);
    }
});

test('der Zombie-Filter wirkt dort, wo er wirken muss', async () => {
    /* Die alte Zusicherung war strukturell unfehlbar: Zombies haben
     * share=0 und sortieren garantiert ans Ende, koennen die ersten acht
     * also nie erreichen. Man konnte den Filter loeschen, ohne dass ein
     * Test fiel. Er wirkt an zwei anderen Stellen. */
    const roh = Q.liesCsv(
        fs.readFileSync(D('data/limitless_online_decks.csv'), 'utf8'), ';');
    const zombies = roh.filter((r) => r.deck_name && Q.zahlAus(r.share_numeric) === 0);
    assert.ok(zombies.length >= 1,
        'die Datei enthaelt keine Zeile mit share=0 mehr — dann kann dieser ' +
        'Test leer bestehen');
    const mitAnteil = roh.filter((r) => r.deck_name && Q.zahlAus(r.share_numeric) > 0);

    const erg = await Q.lade('meta-online');
    /* 1. Im Spaltenkopf: "8 von N" muss die Zahl OHNE Zombies sein. */
    const n = Q.zahlAus(erg.listeKopf.split(' von ')[1]);
    assert.equal(n, mitAnteil.length,
        `der Kopf nennt ${n} Decks, ohne Zombies sind es ${mitAnteil.length} ` +
        `(mit: ${roh.filter((r) => r.deck_name).length})`);
    /* 2. In der Deck-Vorschlagsliste der Zahl-Vorlage. */
    zombies.forEach((z) => {
        assert.ok(!erg.decks.includes(z.deck_name),
            `${z.deck_name} steht mit share=0 in der Deck-Auswahl — wer es ` +
            'waehlt, bekommt eine Zahl ohne Grundlage aufs Bild');
    });
});

test('kein Wert wird beim Malen abgeschnitten — ueber ALLE Decks', async () => {
    /* Die alte Fassung prueft nur erg.decks[0]. Fuer die Matchups sind
     * das 8 von 1.702 Paarungen, und die echte Ausgabe verletzte ihre
     * eigene Grenze: "Dragapult | 52 % · 1049" hat elf Zeichen. */
    const GRENZE = 12;
    const erg = await Q.lade('matchups-online');
    for (const deck of erg.decks) {
        zeilenVon(erg.proDeck(deck)).forEach((z) => {
            assert.ok(z.wert.length <= GRENZE,
                `${deck} → "${z.wert}" hat ${z.wert.length} Zeichen, die Spalte ` +
                `fasst ${GRENZE} — es wuerde stumm abgeschnitten`);
        });
    }
});

test('der Nenner der Zahl-Vorlage ueberlebt den Umbruch', async () => {
    /* `malZahl` laeuft `umbruch(...).slice(0, 2)`. Die alte Zusicherung
     * zaehlte nur die \n und die Zeichen je Absatz — sie modellierte den
     * Umbruch nicht. Der Worlds-Nenner begann mit dem VOLLEN
     * Turniernamen (57 Zeichen), brach um, und "Siegquote 42,4 % —
     * Unentschieden zaehlen mit" wurde Zeile drei und verschwand ohne
     * Auslassungszeichen. */
    const BREITE = 56;      /* Zeichen je Zeile bei Mono 26 auf 880 px */
    function umbruch(text) {
        const raus = [];
        String(text).split('\n').forEach((absatz) => {
            let zeile = '';
            absatz.split(/\s+/).forEach((wort) => {
                const probe = zeile ? zeile + ' ' + wort : wort;
                if (probe.length > BREITE && zeile) { raus.push(zeile); zeile = wort; }
                else zeile = probe;
            });
            if (zeile) raus.push(zeile);
        });
        return raus;
    }
    for (const e of Q.liste()) {
        const erg = await Q.lade(e.id);
        if (!erg.zahlFuer || !erg.decks) continue;
        for (const deck of erg.decks.slice(0, 5)) {
            const z = erg.zahlFuer(deck);
            if (!z) continue;
            const gemalt = umbruch(z.zahlNenner);
            assert.ok(gemalt.length <= 2,
                `${e.name} / ${deck}: der Nenner braucht ${gemalt.length} Zeilen, ` +
                `die Vorlage malt zwei. Verworfen wuerde: ` +
                JSON.stringify(gemalt.slice(2)));
        }
    }
});

test('Champions zaehlt keinen Platzhalter als Turnier', async () => {
    /* 13 der 114 Teams tragen tournament: "-". Die erste Fassung zaehlte
     * den Platzhalter als 25. Turnier. */
    const d = JSON.parse(fs.readFileSync(D('data/champions_replica_teams.json'), 'utf8'));
    const echt = new Set();
    let ohne = 0;
    d.teams.forEach((t) => {
        const n = String(t.tournament || '').trim();
        if (n && n !== '-') echt.add(n); else ohne++;
    });
    assert.ok(ohne >= 1,
        'kein Team ohne Turnierangabe mehr — dann prueft dieser Test nichts');
    const erg = await Q.lade('champions');
    assert.ok(erg.fuss.includes(String(echt.size)),
        `die Fusszeile nennt nicht ${echt.size} echte Turniere: ${erg.fuss}`);
    assert.ok(!erg.fuss.includes(String(echt.size + ohne)) || echt.size + ohne === echt.size,
        `die Fusszeile zaehlt den Platzhalter mit: ${erg.fuss}`);
});

test('keine Liste schneidet mitten in einen Gleichstand', async () => {
    /* Rang 8 bei Champions war Sneasler mit 23 — Sylveon und Venusaur
     * stehen ebenfalls bei 23. Acht Zeilen zeigten einen davon mit der
     * Ziffer 08 davor und behaupteten eine Ordnung, die die Daten nicht
     * haben. Dasselbe Argument wie bei Pocket. */
    /* ALLE ACHT RANGLISTEN, UND AN DEN MATCHUPS UEBER JEDES DECK.
     *
     * Die erste Fassung endete in `assert.ok(letzte)` auf einem
     * nicht-leeren String — sie konnte nicht fallen. Jetzt wird der
     * naechste, NICHT gezeigte Eintrag wirklich verglichen: dafuer laesst
     * sich jede Quelle mit einem MAX von neun nachrechnen, indem die
     * gezeigte Liste gegen die vollstaendige gehalten wird.
     *
     * Die vollstaendige Liste steht nicht zur Verfuegung — also der
     * Umweg, der genauso trennscharf ist: kein gezeigter Wert darf
     * doppelt vorkommen, WENN die Liste gekuerzt wurde. Ein Gleichstand
     * INNERHALB der Ausgabe waere sonst ein Gleichstand, der auch an der
     * Grenze haette liegen koennen. */
    const erg2 = await Q.lade('matchups-online');
    let geprueftDecks = 0;
    for (const deck of erg2.decks) {
        const zeilen = zeilenVon(erg2.proDeck(deck));
        const gesamt = Q.zahlAus((erg2.proDeck(deck).listeKopf.match(/von (\d+)/) || [])[1]);
        if (!isFinite(gesamt) || gesamt <= zeilen.length) continue;
        geprueftDecks++;
        const letzte = zeilen[zeilen.length - 1].wert;
        const naechste = zeilen.filter((z) => z.wert === letzte).length;
        /* Der Schnitt darf keine Gruppe an der GRENZE treffen: dann
         * traegt der letzte gezeigte Wert eine Gruppe, deren Rest
         * weggefallen ist. Steht er mehrfach in der Ausgabe, ist die
         * ganze Gruppe drin — und dann muessen die Rangziffern weg. */
        const q = erg2.proDeck(deck);
        if (naechste > 1) {
            assert.equal(q.ohneRang, true,
                `${deck}: "${letzte}" steht ${naechste}-mal in der Ausgabe, ` +
                'aber die Rangziffern werden trotzdem gemalt');
        }
    }
    assert.ok(geprueftDecks >= 20,
        `nur ${geprueftDecks} Decks wurden geprueft — dann laeuft die Schleife ` +
        'weitgehend leer');
    /* Und der harte Fall, an dem es aufgefallen ist: */
    const ch = await Q.lade('champions');
    const zeilen = zeilenVon(ch);
    const letzterWert = Q.zahlAus(zeilen[zeilen.length - 1].wert.split(' von ')[0]);
    const d = JSON.parse(fs.readFileSync(D('data/champions_replica_teams.json'), 'utf8'));
    const zaehl = {};
    d.teams.forEach((t) => {
        const g = {};
        (t.pokemon || []).forEach((p) => {
            const n = p.name || p.slug;
            if (!n || g[n]) return;
            g[n] = 1; zaehl[n] = (zaehl[n] || 0) + 1;
        });
    });
    const gezeigt = new Set(zeilen.map((z) => z.name));
    Object.keys(zaehl).forEach((n) => {
        if (zaehl[n] === letzterWert) {
            assert.ok(gezeigt.has(n),
                `${n} hat ${zaehl[n]} Teams wie die letzte gezeigte Zeile, steht ` +
                'aber nicht im Bild — der Gleichstand ist angeschnitten');
        }
    });
});

test('Staples spaltet keine Karte ueber ihre Drucke', async () => {
    /* Chi-Yu steht dreifach in der Datei (MEG 31, TWM 39, PBL 59) und
     * fiel deshalb aus den ersten acht, obwohl es zusammen mehr
     * Archetypen sind als bei manchem gezeigten Eintrag. */
    const roh = Q.liesCsv(
        fs.readFileSync(D('data/current_meta_card_data.csv'), 'utf8'), ';')
        .filter((r) => r.meta === 'Meta Live' && r.archetype !== 'Other' && r.card_name);
    const proName = {};
    roh.forEach((r) => {
        if (!proName[r.card_name]) proName[r.card_name] = new Set();
        proName[r.card_name].add(r.archetype);
    });
    const gespalten = {};
    roh.forEach((r) => {
        if (!gespalten[r.card_name]) gespalten[r.card_name] = new Set();
        gespalten[r.card_name].add(r.card_identifier);
    });
    const mehrfach = Object.keys(gespalten).filter((n) => gespalten[n].size > 1);
    assert.ok(mehrfach.length >= 3,
        `nur ${mehrfach.length} Karten mit mehreren Drucken — dann prueft dieser ` +
        'Test den Fall nicht mehr');

    const erg = await Q.lade('staples');
    zeilenVon(erg).forEach((z) => {
        const soll = proName[z.name].size;
        const ist = Q.zahlAus(z.wert.split(' von ')[0]);
        assert.equal(ist, soll,
            `${z.name} steht mit ${ist} im Bild, ueber alle Drucke sind es ${soll}`);
    });
});

test('die Top-8-Schwelle stimmt mit der der Seite ueberein', () => {
    /* Die Post-Seite laedt js/app-utils.js nicht, also gibt es keine
     * echte Kopplung an CONV_MIN_N. Die Zahl steht im Rezept — und diese
     * Zusicherung faellt, wenn die beiden auseinanderlaufen. */
    const quelle = fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8');
    const utils = fs.readFileSync(D('js/app-utils.js'), 'utf8');
    const meins = quelle.match(/var MIN = (\d+);/);
    const seite = utils.match(/CONV_MIN_N\s*=\s*(\d+)/);
    assert.ok(meins, 'die Schwelle steht nicht mehr als `var MIN = N;` im Rezept');
    assert.ok(seite, 'CONV_MIN_N steht nicht mehr in js/app-utils.js');
    assert.equal(meins[1], seite[1],
        `die Post-Seite rechnet ab ${meins[1]} Antritten, die Seite ab ` +
        `${seite[1]} — dann zeigt ein Post ein anderes Feld als die Tabelle`);
});

test('eine leere oder kaputte Quelle liefert einen Fehler, kein halbes Bild', async () => {
    /* Vorher lief eine leere Datei durch: null Zeilen, Kopf "alle 0",
     * und die Fusszeile behauptete weiter "aus 39.842 Listen" — Titel
     * und Nenner ueber einer leeren Tafel. */
    const echt = fs.readFileSync;
    const leer = {
        'meta-online': 'data/limitless_online_decks.csv',
        'worlds-tag1': 'data/labs_tournament_decks_TEF-PBL.csv',
        'top8': 'data/online_tournament_top8_decks.csv',
        'staples': 'data/current_meta_card_data.csv'
    };
    for (const id of Object.keys(leer)) {
        const ctx = fenster();
        const treffer = leer[id];
        const alt = ctx.fetch;
        ctx.fetch = (u) => String(u).includes(treffer.split('/').pop())
            ? Promise.resolve({ ok: true, status: 200,
                text: () => Promise.resolve(echt(D(treffer), 'utf8').split('\n')[0] + '\n'),
                json: () => Promise.resolve({}) })
            : alt(u);
        let geworfen = null;
        await ctx.window.DsPostQuellen.lade(id).catch((e) => { geworfen = e; });
        assert.ok(geworfen,
            `${id} laeuft mit einer leeren Datei durch, statt zu melden — das ` +
            'ergibt ein Bild mit Titel und Nenner ueber einer leeren Tafel');
    }
});

/* ── Proben an GESETZTEN Werten ────────────────────────────────────────
 *
 * Drei Mechanismen laufen an den Daten dieser Woche leer: der
 * Turnierfilter (TEF-PBL hat heute EIN Turnier), der Gleichstandsschnitt
 * bei Staples (heute keiner an der Grenze) und die Zaehlung je
 * Archetyp statt je Druck (heute traegt kein Archetyp zwei Drucke
 * derselben Top-Karte).
 *
 * Ein Mutationslauf am 04.09.2026 hat alle drei ausgebaut, ohne dass
 * eine Zusicherung fiel. Gegen Livedaten ist das nicht zu schliessen —
 * also gegen gesetzte Werte, wie es die Hausregel fuer solche Faelle
 * ohnehin vorzieht.
 */
function mitDatei(pfadTeil, inhalt) {
    const ctx = fenster();
    const echt = ctx.fetch;
    ctx.fetch = (u) => String(u).includes(pfadTeil)
        ? Promise.resolve({ ok: true, status: 200,
            text: () => Promise.resolve(inhalt),
            json: () => Promise.resolve(JSON.parse(inhalt)) })
        : echt(u);
    return ctx.window.DsPostQuellen;
}

test('mehrere Turniere in einer Datei ergeben trotzdem ein Bild', async () => {
    /* Nachgestellt aus dem Befund: 389 Spieler aus Indianapolis unter
     * dem Nenner 485 aus Lima ergaeben 80,2 % statt 20,0 %. */
    const kopf = 'tournament_id,tournament_name,tournament_date,total_players,' +
                 'deck_name,player_count,wins,losses,ties,day1_players,day2_players';
    const zeilen = [
        kopf,
        '0001,Altes Turnier,2026-01-01,1000,Riesendeck,900,10,0,0,900,90',
        '0001,Altes Turnier,2026-01-01,1000,Zweitdeck,100,5,5,0,100,10',
        '0002,Neues Turnier,2026-08-01,200,Alpha,120,60,40,0,120,40',
        '0002,Neues Turnier,2026-08-01,200,Beta,80,30,50,0,80,10'
    ].join('\n');
    const Q2 = mitDatei('labs_tournament_decks_TEF-PBL.csv', zeilen);

    const erg = await Q2.lade('worlds-tag1');
    const namen = zeilenVon(erg).map((z) => z.name);
    assert.deepEqual(namen, ['Alpha', 'Beta'],
        `es wurden Zeilen aus beiden Turnieren genommen: ${namen.join(', ')}`);
    assert.ok(erg.listeKopf.includes('200'),
        `der Nenner stammt nicht aus dem juengsten Turnier: ${erg.listeKopf}`);
    assert.ok(erg.fuss.includes('Neues Turnier') && !erg.fuss.includes('Altes'),
        `die Fusszeile nennt das falsche Turnier: ${erg.fuss}`);
    assert.ok(erg.kicker.includes('Neues Turnier'),
        `der Kicker nennt das falsche Turnier: ${erg.kicker}`);

    const z = erg.zahlFuer('Alpha');
    assert.equal(z.zahl, '60,0 %', `120 von 200 sind 60 %, nicht ${z.zahl}`);
});

test('ein Gleichstand an der achten Stelle wird nicht angeschnitten', async () => {
    /* Neun Pokemon, die letzten drei gleichauf: gezeigt werden sechs,
     * nicht acht. */
    const teams = [];
    const wie = { A: 9, B: 8, C: 7, D: 6, E: 5, F: 4, G: 3, H: 3, I: 3 };
    let nr = 0;
    Object.keys(wie).forEach((name) => {
        for (let i = 0; i < wie[name]; i++) {
            teams.push({ tournament: 'T' + (nr++ % 4), pokemon: [{ name: name }] });
        }
    });
    const Q2 = mitDatei('champions_replica_teams.json', JSON.stringify({
        _meta: { team_count: teams.length, last_updated: '2026-09-04',
                 current_regulation: 'M-B' },
        teams: teams
    }));
    const erg = await Q2.lade('champions');
    const namen = zeilenVon(erg).map((z) => z.name);
    assert.deepEqual(namen, ['A', 'B', 'C', 'D', 'E', 'F'],
        `der Gleichstand bei drei Teams ist angeschnitten: ${namen.join(', ')}`);
});

test('eine Karte mit zwei Drucken wird einmal gezaehlt', async () => {
    /* Chi-Yu steht heute dreifach in der echten Datei (MEG 31, TWM 39,
     * PBL 59). Hier derselbe Fall gesetzt: "Doppeldruck" steckt in drei
     * Archetypen, in einem davon mit BEIDEN Drucken. Richtig sind drei,
     * nicht vier. */
    const kopf = 'archetype;card_name;card_identifier;meta';
    const zeilen = [kopf];
    ['A', 'B', 'C'].forEach((arch) => {
        zeilen.push(`${arch};Doppeldruck;SET 1;Meta Live`);
    });
    zeilen.push('A;Doppeldruck;SET 2;Meta Live');          /* zweiter Druck */
    ['A', 'B', 'C', 'D'].forEach((arch) => {
        zeilen.push(`${arch};Einzeldruck;SET 9;Meta Live`);
    });
    const Q2 = mitDatei('current_meta_card_data.csv', zeilen.join('\n'));
    const erg = await Q2.lade('staples');
    const nach = {};
    zeilenVon(erg).forEach((z) => { nach[z.name] = z.wert; });
    assert.equal(nach['Doppeldruck'], '3 von 4',
        `ein zweiter Druck im selben Archetyp wurde mitgezaehlt: ` +
        JSON.stringify(nach));
    assert.equal(nach['Einzeldruck'], '4 von 4');
});

test('auch Staples schneidet keinen Gleichstand an', async () => {
    /* Wie bei Champions, nur an gesetzten Werten: an der achten Stelle
     * der echten Datei liegt heute zufaellig kein Gleichstand, also kann
     * die Livedaten-Probe den Mechanismus nicht ausloesen. Ein
     * Mutationslauf am 04.09.2026 hat den Schnitt ausgebaut, ohne dass
     * eine Zusicherung fiel. */
    /* G, H und I liegen alle bei vier Archetypen. Die Gruppe beginnt an
     * Stelle sieben und reichte damit ueber die achte hinaus — gezeigt
     * werden deshalb sechs Zeilen, nicht acht. */
    const wie = { A: 10, B: 9, C: 8, D: 7, E: 6, F: 5, G: 4, H: 4, I: 4 };
    const zeilen = ['archetype;card_name;card_identifier;meta'];
    Object.keys(wie).forEach((karte) => {
        for (let i = 0; i < wie[karte]; i++) {
            zeilen.push(`Arch${i};${karte};SET 1;Meta Live`);
        }
    });
    const Q2 = mitDatei('current_meta_card_data.csv', zeilen.join('\n'));
    const erg = await Q2.lade('staples');
    const namen = zeilenVon(erg).map((z) => z.name);
    assert.deepEqual(namen, ['A', 'B', 'C', 'D', 'E', 'F'],
        `der Gleichstand bei vier Archetypen ist angeschnitten: ${namen.join(', ')}`);
    /* KEIN "x von y" IM KOPF — und das ist hier richtig.
     * Der Spaltenkopf traegt bei Staples den Nenner der WERTE
     * ("Archetypen · von 59"), und jede Zeile wiederholt ihn
     * ("59 von 59"). Die Hausregel ist damit erfuellt. Ein zweites
     * "6 von 400" waere die Zahl aller Karten des Formats — die haelt
     * ohnehin niemand fuer den Inhalt eines Achterbildes, anders als bei
     * "8 von 131 Decks". */
    assert.ok(/von \d+/.test(erg.listeKopf),
        `der Kopf nennt den Nenner der Werte nicht: ${erg.listeKopf}`);
});

test('keine Tag-2-Zeile steht unter der Schwelle, die im Kopf genannt ist', async () => {
    const erg = await Q.lade('tag2');
    const schwelle = Q.zahlAus((erg.fuss.match(/ab (\d+)/) || [])[1]);
    assert.ok(isFinite(schwelle) && schwelle > 1,
        `die Fusszeile nennt keine Schwelle: ${erg.fuss}`);
    zeilenVon(erg).forEach((z) => {
        const nenner = Q.zahlAus(z.wert.split(' von ')[1]);
        assert.ok(nenner >= schwelle,
            `${z.name} steht mit ${z.wert} im Bild, die Fusszeile verspricht ` +
            `"ab ${schwelle} Spielern"`);
    });
    /* Und es MUSS Decks unter der Schwelle geben, sonst prueft das nichts. */
    const roh = Q.liesCsv(
        fs.readFileSync(D('data/labs_tournament_decks_TEF-PBL.csv'), 'utf8'), ',');
    const drunter = roh.filter((r) => {
        const n = Q.zahlAus(r.day1_players);
        return isFinite(n) && n > 0 && n < schwelle;
    });
    assert.ok(drunter.length >= 3,
        `nur ${drunter.length} Decks unter der Schwelle — dann prueft dieser ` +
        'Test die Schwelle nicht mehr');
});

test('jeder Waechter wirft wirklich', async () => {
    /* Fuenf der Wuerfe dieser Runde hatten keine einzige Zusicherung —
     * ein Mutationslauf konnte sie alle entfernen, ohne dass etwas rot
     * wurde (zweite Abnahme, 04.09.2026). Hier wird jeder einmal
     * ausgeloest. */
    const faelle = [
        ['fehlende Spalte tournament_id', 'labs_tournament_decks_TEF-PBL.csv',
         'worlds-tag1',
         'tournament_name,tournament_date,total_players,deck_name,player_count\n' +
         'T,2026-01-01,100,Alpha,50'],
        ['unerwartetes Datumsformat', 'labs_tournament_decks_TEF-PBL.csv',
         'worlds-tag1',
         'tournament_id,tournament_name,tournament_date,total_players,deck_name,player_count\n' +
         '1,T,01.01.2026,100,Alpha,50'],
        ['total_players mit Tausenderpunkt', 'labs_tournament_decks_TEF-PBL.csv',
         'worlds-tag1',
         'tournament_id,tournament_name,tournament_date,total_players,deck_name,player_count\n' +
         '1,T,2026-01-01,1.970,Alpha,50'],
        ['Matchup-Datei ohne Spalte record', 'limitless_online_decks_matchups.csv',
         'matchups-online',
         'deck_name;opponent;win_rate;total_games\nA;B;60;10\nA;C;55;10\nA;D;50;10'],
        ['Matchup-Zeilen ohne Bilanz', 'limitless_online_decks_matchups.csv',
         'matchups-online',
         'deck_name;opponent;win_rate;record;total_games\n' +
         'A;B;60;3 - 0 - 0;3\nA;C;55;;10\nA;D;50;;10\nA;E;50;;10'],
        ['Pocket mit unbekannter Stufe', 'pocket_tierlist.json', 'pocket',
         JSON.stringify({ _meta: { abgerufen: '2026-09-04' },
                          decks: [{ name: 'X', tier: 'SS' }, { name: 'Y', tier: 'S' }] })],
        ['Champions ohne Pokemon', 'champions_replica_teams.json', 'champions',
         JSON.stringify({ _meta: { team_count: 1, last_updated: '2026-09-04' },
                          teams: [{ tournament: 'T', pokemon: [] }] })]
    ];
    for (const [was, datei, id, inhalt] of faelle) {
        const Q2 = mitDatei(datei, inhalt);
        let geworfen = null;
        await Q2.lade(id).catch((e) => { geworfen = e; });
        assert.ok(geworfen, `${was}: die Quelle laeuft durch, statt zu melden`);
        assert.ok(String(geworfen.message).length > 30,
            `${was}: die Meldung sagt nicht, was zu tun ist: ${geworfen.message}`);
    }
});

test('alle Werte gleich ergibt keine leere Tafel', async () => {
    /* `ohneGleichstand` gab bei durchgehendem Gleichstand `slice(0, 0)`
     * zurueck — `malListe` bricht dann ab, waehrend Titel, Spaltenkopf
     * und Nenner weiter gemalt werden. Genau der Zustand, gegen den die
     * Leere-Datei-Wuerfe geschrieben sind. */
    const zeilen = ['archetype;card_name;card_identifier;meta'];
    for (let k = 0; k < 10; k++) {
        for (let a = 0; a < 10; a++) zeilen.push(`Arch${a};K${k};SET 1;Meta Live`);
    }
    const Q2 = mitDatei('current_meta_card_data.csv', zeilen.join('\n'));
    let geworfen = null;
    const erg = await Q2.lade('staples').catch((e) => { geworfen = e; });
    if (!geworfen) {
        assert.ok(String(erg.zeilen || '').trim(),
            'die Quelle liefert eine leere Zeilenliste unter Titel und Nenner');
    }
    assert.ok(geworfen, 'zehn gleichauf liegende Karten ergeben keinen Befund');
});

test('eine zu lange Fusszeile verliert ihren Nenner nicht', async () => {
    /* Mit einem Regional als Anker stand
     * "Regional Championship Indianapolis, 30.05. · 1.970 Spieler" —
     * 58 Zeichen in einer Zeile, die 48 fasst. Der NENNER faellt dabei
     * vom Bild. */
    const kopf = 'tournament_id,tournament_name,tournament_date,total_players,' +
                 'deck_name,player_count,wins,losses,ties,day1_players,day2_players';
    const lang = 'Regional Championship Irgendwo Sehr Weit Weg Am Ende Der Welt';
    const Q2 = mitDatei('labs_tournament_decks_TEF-PBL.csv', [kopf,
        `1,${lang},2026-01-01,1970,Alpha,900,10,5,0,900,90`,
        `1,${lang},2026-01-01,1970,Beta,700,8,7,0,700,70`,
        `1,${lang},2026-01-01,1970,Gamma,370,5,9,0,370,30`].join('\n'));
    for (const id of ['worlds-tag1', 'tag2']) {
        const erg = await Q2.lade(id);
        assert.ok(erg.fuss.length <= 48,
            `${id}: die Fusszeile hat ${erg.fuss.length} Zeichen: ${erg.fuss}`);
        assert.ok(/\d/.test(erg.fuss.split('·').pop()),
            `${id}: der Nenner ist aus der Fusszeile gefallen: ${erg.fuss}`);
    }
    const erg = await Q2.lade('worlds-tag1');
    assert.ok(erg.fuss.includes('1.970'),
        `die Feldgroesse steht nicht mehr in der Fusszeile: ${erg.fuss}`);
});

test('jeder Turniername passt in die Fusszeile', () => {
    /* `kurzTurnier` kannte genau einen Praefix ("World Championship").
     * Das ging gut, weil der Anker dieser Woche ein Worlds ist — mit
     * einem Regional lief die Fusszeile auf 58 von 48 Zeichen und der
     * Nenner fiel vom Bild. Hier alle Formen, die in data/ vorkommen. */
    const echte = new Set();
    fs.readdirSync(D('data')).filter((f) => /^labs_tournament_decks_.*\.csv$/.test(f))
        .forEach((f) => {
            Q.liesCsv(fs.readFileSync(D('data/' + f), 'utf8'), ',')
                .forEach((r) => { if (r.tournament_name) echte.add(r.tournament_name); });
        });
    assert.ok(echte.size >= 10,
        `nur ${echte.size} Turniernamen gefunden — dann prueft dieser Test wenig`);
    const zuLang = [];
    echte.forEach((n) => {
        /* Der laengste Rest einer Fusszeile: ", 30.05. · 1.970 Spieler"
         * sind 24 Zeichen, es bleiben 24 fuer den Namen. */
        const kurz = Q.kurzTurnier(n);
        if (kurz.length > 24) zuLang.push(n + ' -> ' + kurz + ' (' + kurz.length + ')');
    });
    assert.ok(zuLang.length <= echte.size * 0.35,
        `${zuLang.length} von ${echte.size} Turniernamen passen auch gekuerzt ` +
        `nicht in die Fusszeile:\n  ${zuLang.slice(0, 6).join('\n  ')}\n` +
        'Ein Praefix fehlt in TURNIER_KURZ.');
    /* Und die Praefixe, die es gibt, muessen wirken. */
    assert.equal(Q.kurzTurnier('Regional Championship Indianapolis'),
                 'Regional Indianapolis');
    assert.equal(Q.kurzTurnier('World Championship San Francisco'),
                 'Worlds San Francisco');
    assert.ok(Q.kurzTurnier('International Championship London').length <= 24);
});

test('die Post-Seite laedt die Quellen ohne Versionsstempel', () => {
    /* `bump-version.sh` schreibt `posts/` nicht. Ein ?v=-Token würde
     * beim ersten Schreiben einfrieren und die Datei für immer aus dem
     * Cache bedienen. */
    const html = fs.readFileSync(D('posts/index.html'), 'utf8');
    assert.ok(html.includes('src="../js/ds-post-quellen.js"'),
        'die Post-Seite lädt js/ds-post-quellen.js nicht');
    assert.ok(!/ds-post-quellen\.js\?v=/.test(html),
        'die Post-Seite hängt ein ?v=-Token an — bump-version.sh schreibt ' +
        'posts/ nicht, das Token würde einfrieren');
    const bump = fs.readFileSync(D('bump-version.sh'), 'utf8');
    assert.ok(!/posts\//.test(bump),
        'bump-version.sh schreibt jetzt posts/ — dann darf (und sollte) die ' +
        'Seite ein Token tragen, und dieser Test gehört umgeschrieben');
});

test('die Post-Seite hat keine eigene Funktion namens teile', () => {
    /* js/app-archetype-card.js:233 hat einen CSV-Zerleger `teile()`, und
     * posts/index.html hat ein `var teile = {logo, blueten, shots}`. Wer
     * den Zerleger dorthin kopiert, überschreibt die Bildteile und die
     * Seite zeichnet leer. */
    const html = fs.readFileSync(D('posts/index.html'), 'utf8');
    assert.ok(!/function\s+teile\s*\(/.test(html),
        'posts/index.html definiert eine Funktion `teile` — die Variable `teile` ' +
        'hält dort die Bildteile, die Seite würde leer zeichnen');
});

test('die Liste kann ihre Rangziffern abbestellen', () => {
    const html = fs.readFileSync(D('posts/index.html'), 'utf8');
    assert.ok(/spec\.ohneRang/.test(html),
        'malListe kennt `ohneRang` nicht — dann malt eine Tier-Liste 01/02 davor ' +
        'und erfindet eine Rangfolge, die in der Quelle nicht existiert');
});

test('der Teilen-Weg ist da, nicht nur der Download', () => {
    /* Der Betreiber postet auch vom Telefon. `<a download>` auf einer
     * Blob-Adresse ist in iOS Safari unzuverlässig — am 28.08.2026 von
     * ihm selbst gemeldet. */
    const html = fs.readFileSync(D('posts/index.html'), 'utf8');
    assert.ok(/navigator\.share/.test(html) && /navigator\.canShare/.test(html),
        'die Post-Seite kennt navigator.share nicht — am iPhone landet das Bild ' +
        'dann nicht zuverlässig in den Fotos');
});
