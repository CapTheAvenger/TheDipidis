/* ══════════════════════════════════════════════════════════════════════
 * HAUPTFILTER → UNTERFILTER → ERGEBNIS
 * ══════════════════════════════════════════════════════════════════════
 *
 * BEFUND DES BETREIBERS (26.09.2026, am Telefon): „Wenn ich bei Posts
 * auf Decklist bin, zeigt er mir bei Fill from die gleichen Optionen an
 * wie überall auch. Das ergibt ja keinen Sinn. […] Grundsätzlich arbeite
 * einfach durch, dass wir immer einen Hauptfilter haben, und der
 * Hauptfilter führt dann zu Unterfiltern und die Unterfilter dann zum
 * entsprechenden Ergebnis."
 *
 * WAS HIER GEPRÜFT WIRD UND WAS NICHT
 * -----------------------------------
 * Diese Datei prüft den GANG durch den Baum: dass jede Stufe nur
 * anbietet, was dahintersteht, dass jedes Blatt entweder ein
 * vollständiges Bild oder einen Befund liefert, und dass die Ketten die
 * sind, die er bestellt hat.
 *
 * Die ZAHLEN der abgeleiteten Datei prüft tests/python/
 * test_post_decklisten.py gegen die echten 45 MB. Hier steht ein kleiner
 * Ausschnitt — und zwar bewusst: eine Zusicherung über die Mechanik darf
 * nicht davon abhängen, welches Turnier diese Woche zuletzt lief. Die
 * Regel „keine selbst zurechtgeschnittenen Ausschnitte" gilt für
 * Aussagen über die Daten, und die stehen in der Python-Datei.
 * ══════════════════════════════════════════════════════════════════ */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MUSTER = require('../post-uebergabe-muster.js');

const WURZEL = path.join(__dirname, '..', '..');
const D = (p) => path.join(WURZEL, p);
const SEITE = fs.readFileSync(D('posts/index.html'), 'utf8');

/* Ein Ausschnitt der abgeleiteten Datei — derselbe Bau wie das Echte
 * (scripts/build_post_decklists.py), nur klein. Zwei Archetypen im
 * Fenster, ein Major mit einem Platz INNERHALB und einem AUSSERHALB der
 * Top 32: nur so hat die Grenze etwas zu halten. */
function LISTEN() {
    return {
        v: 1, gebaut: '2026-09-26T00:00:00Z',
        quelle: 'data/tournament_decklists_per_player.csv',
        fenster: { von: '2026-09-19', bis: '2026-09-25', tage: 7, erfolg_platz: 8 },
        verworfen_unvollstaendig: 0, je_archetyp: 8,
        bild_praefix: 'https://beispiel.example/',
        bilder: { 'TEF-113': 'a.png', 'PBL-65': 'b.png' },
        sieben_tage: {
            'Mega Excadrill': [
                { turnier: 'Rare Candy Club Showdown #45', datum: '2026-09-21',
                  meta: 'TEF-PBL', feld: 386, platz: 1, w: 10, l: 1, t: 1,
                  karten: [['Beldum', 'TEF', '113', 4], ['Mega Excadrill ex', 'PBL', '65', 3],
                           ['Basic Metal Energy', 'SVE', '16', 53]] },
                { turnier: 'Sunny’s Weekly #274', datum: '2026-09-20',
                  meta: 'TEF-PBL', feld: 178, platz: 4, w: 8, l: 2, t: 0,
                  karten: [['Beldum', 'TEF', '113', 4], ['Basic Metal Energy', 'SVE', '16', 56]] }
            ],
            Dragapult: [
                { turnier: 'Amyverse PTCG Live Weekly #14', datum: '2026-09-23',
                  meta: 'TEF-PBL', feld: 203, platz: 2, w: 7, l: 1, t: 1,
                  karten: [['Dreepy', 'TWM', '128', 4], ['Basic Psychic Energy', 'SVE', '13', 56]] }
            ]
        },
        major: {
            name: 'Regional Baltimore, MD – Limitless', datum: '2026-09-18',
            meta: 'TEF-PBL', plaetze: 32,
            listen: [
                { platz: 1, archetyp: 'Slowking', w: 12, l: 2, t: 1,
                  karten: [['Slowking', 'BLK', '58', 4], ['Basic Water Energy', 'SVE', '11', 56]] },
                { platz: 7, archetyp: 'Mega Excadrill', w: 10, l: 3, t: 2,
                  karten: [['Beldum', 'TEF', '113', 4], ['Basic Metal Energy', 'SVE', '16', 56]] },
                { platz: 29, archetyp: 'Slowking', w: 9, l: 4, t: 2,
                  karten: [['Slowking', 'BLK', '58', 3], ['Basic Water Energy', 'SVE', '11', 57]] }
            ]
        }
    };
}

function fenster(opt) {
    opt = opt || {};
    const listen = opt.listen === undefined ? LISTEN() : opt.listen;
    const ctx = { console };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.fetch = function (u) {
        const rel = String(u).replace(/^\.\.\//, '');
        if (rel === 'data/post_decklists.json') {
            if (opt.fetchListen) return opt.fetchListen();
            if (!listen) return Promise.resolve({ ok: false, status: 404 });
            return Promise.resolve({
                ok: true, status: 200,
                json: () => Promise.resolve(listen),
                text: () => Promise.resolve(JSON.stringify(listen))
            });
        }
        const p = D(rel);
        const da = fs.existsSync(p);
        return Promise.resolve({
            ok: da, status: da ? 200 : 404,
            text: () => Promise.resolve(fs.readFileSync(p, 'utf8')),
            json: () => Promise.resolve(JSON.parse(fs.readFileSync(p, 'utf8')))
        });
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(D('js/matchup-glaettung.js'), 'utf8'), ctx,
                    { filename: 'matchup-glaettung.js' });
    MUSTER.uebergabeEinrichten(ctx, opt.art || 'metacall');
    if (opt.bestandBauen) opt.bestandBauen(ctx);
    else if (!opt.ohneBestand) MUSTER.bestandEinrichten(ctx);
    vm.runInContext(fs.readFileSync(D('js/ds-post-quellen.js'), 'utf8'), ctx,
                    { filename: 'ds-post-quellen.js' });
    return ctx.window.DsPostQuellen;
}

function namen(stufe) {
    return stufe.optionen.map((o) => o.name);
}

function zeilenVon(erg) {
    return String(erg.zeilen || '').split('\n').filter(Boolean).map((z) => {
        const t = z.split('|');
        return { name: t[0].trim(), wert: (t[1] || '').trim() };
    });
}

/* JEDEN PFAD DES BAUMS EINMAL.
 *
 * Erweitert wird immer die ERSTE Stufe, die `kaskade` selbst beantwortet
 * hat (Index = Länge des Pfads). Der erste Anlauf tauschte nur die
 * Geschwister der LETZTEN Stufe aus — der lief im Kreis und brachte
 * nie ein tieferes Blatt. */
async function alleBlaetter(Q, deckel) {
    const aus = [];
    let besuche = 0;
    async function gehe(pfad) {
        if (++besuche > (deckel || 2000)) throw new Error('der Baum hört nicht auf');
        const k = await Q.kaskade(pfad);
        const st = k.stufen[pfad.length];
        if (!st) {
            if (k.blatt) {
                aus.push({ pfad: k.stufen.map((x) => x.wahl), stufen: k.stufen, blatt: k.blatt });
            }
            return;
        }
        for (const o of st.optionen) await gehe(pfad.concat([o.id]));
    }
    await gehe([]);
    return aus;
}

/* ══ 1 · DER BAU DES BAUMS ═════════════════════════════════════════ */

test('der Hauptfilter traegt die fuenf bestellten Richtungen', () => {
    const Q = fenster();
    const ids = Q.BAUM.map((h) => h.id);
    /* „Ja, also Hauptfeature Metacall" — der steht oben. */
    assert.equal(ids[0], 'metacall',
        `der Meta Call ist nicht der erste Hauptfilter: ${ids.join(', ')}`);
    ['metacall', 'decks', 'journal'].forEach((id) => {
        assert.ok(ids.includes(id), `Hauptfilter ${id} fehlt: ${ids.join(', ')}`);
    });
    /* „Weitere Posts Feature mit entsprechender Vorfilterung" — die
       dreizehn alten Quellen verschwinden nicht, ihre Gruppe wird der
       Hauptfilter. */
    const gruppen = new Set(Object.keys(Q.REZEPTE)
        .map((id) => Q.REZEPTE[id].gruppe)
        .filter((g) => g && g !== 'Mine'));
    const erreichbar = new Set();
    Q.BAUM.forEach((h) => {
        const o = typeof h.optionen === 'function' ? h.optionen([]) : h.optionen;
        (o || []).forEach((x) => { if (Q.REZEPTE[x.id]) erreichbar.add(Q.REZEPTE[x.id].gruppe); });
    });
    gruppen.forEach((g) => assert.ok(erreichbar.has(g),
        `die Gruppe „${g}" ist über keinen Hauptfilter erreichbar`));
});

test('jede offene Stufe wird mit ihrer ersten Option beantwortet', async () => {
    /* „Der Hauptfilter führt dann zu Unterfiltern und die Unterfilter
       dann zum entsprechenden Ergebnis." Wer „decks" wählt, soll ein Bild
       bekommen, nicht drei leere Wähler. */
    const Q = fenster();
    const k = await Q.kaskade(['decks']);
    assert.ok(k.blatt, 'ein Hauptfilter allein erreicht kein Blatt');
    assert.ok(k.stufen.length >= 3,
        `„decks" führt über ${k.stufen.length} Stufen, erwartet mindestens 3`);
    k.stufen.forEach((st, i) => {
        assert.ok(st.wahl, `Stufe ${i} („${st.frage}") hat keine Wahl`);
        assert.ok(st.optionen.some((o) => o.id === st.wahl),
            `Stufe ${i}: die Wahl „${st.wahl}" steht nicht in ihren Optionen`);
    });
});

test('keine Stufe bietet eine leere Auswahl an', async () => {
    const Q = fenster();
    for (const b of await alleBlaetter(Q)) {
        b.stufen.forEach((st, i) => {
            assert.ok(st.optionen.length,
                `${b.pfad.join(' / ')}: Stufe ${i} („${st.frage}") ist leer — ` +
                'ein Wähler ohne Einträge ist ein Versprechen, das beim Klick bricht');
            st.optionen.forEach((o) => assert.ok(String(o.name || '').trim(),
                `${b.pfad.join(' / ')}: eine Option ohne Namen`));
        });
    }
});

/* ══ 2 · DIE FÜNF KETTEN ═══════════════════════════════════════════ */

test('Decks fuehrt auf My Decks und zeigt ALLE uebergebenen Decks', async () => {
    /* „Wenn ich also auf Decks, dann sollte danach die nächste Option My
       Decks sein. Dann zeigt er mir im nächsten Filter genau meine Decks
       an, aus denen ich wählen kann." */
    const Q = fenster();
    const k = await Q.kaskade(['decks']);
    assert.equal(k.stufen[1].wahl, 'meine',
        `nach „Decks" steht nicht „My decks", sondern ${k.stufen[1].wahl}`);
    assert.match(k.stufen[1].optionen[0].name, /My decks/,
        `die erste Unteroption heißt nicht „My decks": ${k.stufen[1].optionen[0].name}`);
    const decks = namen(k.stufen[2]);
    assert.deepEqual(decks,
        ['Mega Excadrill - Frankfurt Sep 26', 'Dragapult Dusknoir - Standard'],
        `nicht alle übergebenen Decks stehen zur Wahl: ${decks.join(' | ')}`);
    /* Und jedes davon malt wirklich sein eigenes Bild. */
    const eins = await (await Q.kaskade(['decks', 'meine', '0'])).blatt.lade();
    const zwei = await (await Q.kaskade(['decks', 'meine', '1'])).blatt.lade();
    assert.notEqual(eins.titel, zwei.titel, 'beide Decks liefern denselben Titel');
    assert.notEqual(eins.zeilen, zwei.zeilen, 'beide Decks liefern dieselbe Liste');
});

test('die 7-Tage-Kette fuehrt ueber den Archetyp auf dessen Listen', async () => {
    /* „Dann die erfolgreichsten Listen der letzten 7 Tage — dann kann ich
       im nächsten Filter den Archetype wählen und in einem weiteren
       Filter sehe ich dann nur von dem Deck die erfolgreichsten Listen." */
    const Q = fenster();
    const k = await Q.kaskade(['decks', 'sieben']);
    assert.equal(k.stufen[2].frage, 'Archetype',
        `die dritte Stufe fragt nicht nach dem Archetyp: ${k.stufen[2].frage}`);
    /* Die Schwelle steht in der Frage — wie beim Major die Top 32. Ohne
       sie wirkt sie stumm, und niemand weiss, warum ein Archetyp fehlt. */
    assert.equal(k.stufen[3].frage, 'List (top 8)',
        `die vierte Stufe fragt nicht nach der Liste: ${k.stufen[3].frage}`);
    /* NUR von dem gewählten Deck: der Archetyp steht im Kicker jedes
       Blattes dieser Stufe. */
    const dp = await Q.kaskade(['decks', 'sieben', 'Dragapult']);
    assert.equal(dp.stufen[3].optionen.length, 1,
        'Dragapult hat im Ausschnitt eine Liste, angeboten werden ' +
        dp.stufen[3].optionen.length);
    const bild = await dp.blatt.lade();
    /* Der Archetyp steht als TITEL, nicht im Kicker: zweimal derselbe
       Name kostete die Zeichen, an denen dann das Datum fehlte (live
       gemessen 26.09.2026). */
    assert.equal(bild.titel, 'Dragapult',
        `das Bild nennt den gewählten Archetyp nicht als Titel: ${bild.titel}`);
    assert.ok(!/Dragapult/.test(bild.kicker),
        `der Archetyp steht zweimal im Kopf: ${bild.kicker} / ${bild.titel}`);
    assert.match(bild.kicker, /Top 8/,
        `das Bild nennt die Schwelle nicht: ${bild.kicker}`);
    assert.match(bild.caption, /Dragapult/,
        `die Bildunterschrift nennt den Archetyp nicht: ${bild.caption}`);
    assert.ok(!/Excadrill/.test(bild.zeilen),
        'in der Dragapult-Liste stehen Karten eines anderen Decks');
    /* DIE PLATZIERUNG TRÄGT IHR FELD — Hausregel „jede Quote trägt ihren
       Nenner", angewandt auf einen Platz. */
    assert.match(bild.fuss, /2nd of 203/,
        `die Feldgröße fehlt in der Fußzeile — „2nd" allein ist keine Aussage: ${bild.fuss}`);
    assert.match(bild.fuss, /7-1-1/, `die Bilanz fehlt in der Fußzeile: ${bild.fuss}`);
    /* UND SIE STEHT EINMAL. Live gemessen am 26.09.2026 nach dem Deploy:
       „1st of 386 · 386 players · 10-1-1 · 2026-09-19" — dieselbe Zahl
       zweimal, zwölf Zeichen in einer Zeile, die 48 fasst. */
    assert.equal((bild.fuss.match(/203/g) || []).length, 1,
        `die Feldgröße steht zweimal in der Fußzeile: ${bild.fuss}`);
    assert.ok(!/players/.test(bild.fuss),
        `neben „of 203" steht noch eine Spielerzahl: ${bild.fuss}`);
});

test('die Archetypen der 7-Tage-Kette stehen alphabetisch, mit dem besten Ergebnis', async () => {
    /* GEMESSEN IM BROWSER (26.09.2026): der erste Bau sortierte nach Zahl
       der Listen. Da fast jeder Archetyp am Deckel von acht liegt, stand
       dort „Alakazam Dudunsparce (8) · Alakazam Dusknoir (8) · Basic Box
       (8)" — 97 Eintraege, und die Zahl war Rauschen. */
    const Q = fenster();
    const k = await Q.kaskade(['decks', 'sieben']);
    const ids = k.stufen[2].optionen.map((o) => o.id);
    assert.deepEqual(ids, ids.slice().sort((a, b) => a.localeCompare(b, 'en')),
        `die Archetypen stehen nicht alphabetisch: ${ids.join(', ')}`);
    /* Statt der Zahl das beste Ergebnis — und das traegt seinen Nenner. */
    const mega = k.stufen[2].optionen.filter((o) => o.id === 'Mega Excadrill')[0];
    assert.ok(mega, 'Mega Excadrill fehlt in der Auswahl');
    assert.match(mega.name, /best 1st of 386/,
        `das beste Ergebnis steht nicht im Namen: ${mega.name}`);
});

test('die Platzierung des Majors traegt ihren Nenner', async () => {
    /* „4th" allein ist keine Aussage. Beim Major nennt die abgeleitete
       Datei die Zahl der GEFUEHRTEN Platzierungen (`gefuehrt`) — eine
       Teilnehmerzahl fuehrt die Quelle fuer Papier-Turniere nicht, und
       eine geschaetzte waere erfunden. */
    const listen = LISTEN();
    listen.major.feld = 3119;
    listen.major.gefuehrt = 559;
    const Q = fenster({ listen: listen });
    const erg = await (await Q.kaskade(['decks', 'major', 'Slowking', '29'])).blatt.lade();
    /* DER NENNER IST DAS FELD, NICHT DIE ZAHL DER EINGEREICHTEN LISTEN
       (Pruefagent, 26.09.2026). Das Regional Baltimore hatte 3.119
       Teilnehmer; 559 davon haben eine Liste eingereicht. Die Fusszeile
       trug „of 559" — dem geposteten Bild fehlte damit der Faktor 5,6,
       waehrend dieselbe Seite in der Events-Kette korrekt „3,119
       players" fuer dasselbe Turnier nannte. */
    assert.match(erg.fuss, /29th of 3,119/,
        `die Fußzeile nennt den Nenner nicht: ${erg.fuss}`);
    assert.ok(!/559/.test(erg.fuss),
        `die Zahl der eingereichten Listen steht als Nenner da: ${erg.fuss}`);
    /* UND DIE BILDUNTERSCHRIFT AUCH — sie ist der Text, der mit nach
       Instagram geht. Sie rechnete mit einem anderen Feld als die
       Fusszeile und verlor die Zahl beim Major ganz. */
    assert.match(erg.caption, /29th of 3,119/,
        `die Bildunterschrift nennt den Nenner nicht: ${erg.caption}`);
    /* Und ohne die Zahl steht KEINE erfundene da. */
    const ohne = LISTEN();
    const Q2 = fenster({ listen: ohne });
    const e2 = await (await Q2.kaskade(['decks', 'major', 'Slowking', '29'])).blatt.lade();
    assert.ok(!/ of \d/.test(e2.fuss),
        `ohne Feldgroesse steht trotzdem ein Nenner da: ${e2.fuss}`);
    assert.ok(!/ of \d/.test(e2.caption),
        `ohne Feldgroesse steht in der Unterschrift ein Nenner: ${e2.caption}`);
});

test('das letzte Major bietet keinen Platz jenseits der Top 32', async () => {
    /* „Da brauchen wir aber nicht mehr anbieten als die Top 32." */
    const Q = fenster();
    const k = await Q.kaskade(['decks', 'major']);
    assert.match(k.stufen[3].frage, /top 32/i,
        `die Grenze steht nicht in der Frage: ${k.stufen[3].frage}`);
    for (const b of await alleBlaetter(Q)) {
        if (b.pfad[0] !== 'decks' || b.pfad[1] !== 'major') continue;
        const platz = parseInt(b.pfad[3], 10);
        assert.ok(platz >= 1 && platz <= 32,
            `Platz ${platz} steht zur Wahl, die Grenze ist 32`);
    }
    /* Und die Platzierungen gehören wirklich zum gewählten Archetyp. */
    const sk = await Q.kaskade(['decks', 'major', 'Slowking']);
    assert.deepEqual(sk.stufen[3].optionen.map((o) => o.id), ['1', '29'],
        'die Plätze des Archetyps stimmen nicht');
});

test('beim Major ueberlebt das Datum im Kicker, nicht der Anhang der Quelle', async () => {
    /* GEFUNDEN IM BILD (26.09.2026, live): im Kopf stand
       „BASIC BOX · REGIONAL BALTIMORE, MD – LIM…" — das Datum war weg.
       Der Kicker fasst vierzig Zeichen; wer sie mit dem Archetyp (steht
       schon als Titel), der Bundesstaats-Abkuerzung und dem Wort
       „Limitless" fuellt, verliert die Angabe, die wirklich etwas sagt.

       Die aeussere Grenze in `fremdeListeScheibe` kuerzt IMMER auf 40 —
       deshalb haelt eine Laengenzusicherung allein gar nichts (probiert:
       beide Verfaelschungen blieben gruen). Geprueft wird, WAS uebrig
       bleibt. */
    const Q = fenster();
    const k = await Q.kaskade(['decks', 'major', 'Slowking']);
    const erg = await k.blatt.lade();
    assert.ok(erg.kicker.length <= Q.KICKER_MAX);
    assert.match(erg.kicker, /2026-09-18/,
        `das Datum ist aus dem Kicker gefallen: ${erg.kicker}`);
    assert.match(erg.kicker, /Baltimore/,
        `der Ort ist aus dem Kicker gefallen: ${erg.kicker}`);
    assert.ok(!/Limitless/.test(erg.kicker),
        `der Anhang der Quelle steht im Kicker: ${erg.kicker}`);
    /* Und die Kuerzung selbst, direkt: sie nimmt den Anhang und die
       Bundesstaats-Abkuerzung, nicht den Namen. */
    assert.equal(Q.kurzTurnier('Regional Baltimore, MD \u2013 Limitless'),
        'Regional Baltimore');
    assert.equal(Q.kurzTurnier('NAIC 2026, New Orleans \u2013 Limitless'),
        'NAIC 2026, New Orleans');
    /* Ohne Anhang bleibt alles, wie es war — die Kuerzung darf nicht an
       Namen greifen, die sie nichts angeht. */
    assert.equal(Q.kurzTurnier('Rare Candy Club Showdown #45'),
        'Rare Candy Club Showdown #45');
});

test('das Fenster steht datiert im Bild, nicht als Beschreibung', async () => {
    /* Der Kopf von scripts/build_post_decklists.py verlangt es: die
       Datei entsteht beim Deploy, „letzte 7 Tage" altert mit jedem Tag
       danach. Ein fuenf Tage alter Deploy schriebe „last 7 days" ueber
       ein Fenster, das vor zwoelf Tagen endete. (Pruefagent 26.09.2026) */
    const Q = fenster();
    const erg = await (await Q.kaskade(['decks', 'sieben', 'Dragapult', '0'])).blatt.lade();
    assert.match(erg.kicker, /19\.09\.[–-]25\.09\./,
        `das Fenster steht nicht im Kicker: ${erg.kicker}`);
    assert.ok(!/last 7 days/i.test(erg.kicker),
        `im Kicker steht die Beschreibung statt der Daten: ${erg.kicker}`);
    assert.ok(erg.kicker.length <= Q.KICKER_MAX);
});

test('die Fusszeile der fremden Listen laeuft nicht ueber', async () => {
    /* GEMESSEN (Pruefagent, 26.09.2026): „1st of 1,024 · 1,024 players ·
       10-1-1 · 2026-09-19" sind 50 Zeichen bei 48 Platz — malFuss
       schneidet dann das Datum ab. Heute fehlten zwei Zeichen. Die
       Zeile geht deshalb durch `fussZeile`, das vorne kuerzt und den
       Nenner hinten stehen laesst. */
    const listen = LISTEN();
    listen.sieben_tage.Dragapult[0].feld = 1024;
    listen.sieben_tage.Dragapult[0].w = 10;
    const Q = fenster({ listen: listen });
    const erg = await (await Q.kaskade(['decks', 'sieben', 'Dragapult', '0'])).blatt.lade();
    assert.ok(erg.fuss.length <= 48,
        `die Fußzeile hat ${erg.fuss.length} Zeichen: ${erg.fuss}`);
    assert.match(erg.fuss, /2026-09-23/,
        `das Datum ist aus der Fußzeile gefallen: ${erg.fuss}`);
    assert.match(erg.fuss, /1,024/,
        `die Feldgröße ist aus der Fußzeile gefallen: ${erg.fuss}`);
});

test('der Spaltenkopf sagt, wie viele Karten nicht im Bild stehen', async () => {
    /* Die Hausregel ueber MAX: „Wer acht von 131 zeigt, ohne die 131 zu
       nennen, laesst den Leser glauben, das sei das ganze Feld."
       `malListe` schneidet bei acht ab, ohne es zu sagen. */
    const Q = fenster();
    const erg = await (await Q.kaskade(['decks', 'major', 'Slowking', '1'])).blatt.lade();
    const n = erg.kartenGitter.length;
    assert.ok(n > 0);
    assert.equal(erg.listeKopf, `Copies (${Math.min(8, n)} of ${n})`,
        `der Spaltenkopf nennt die Zahl nicht: ${erg.listeKopf}`);
});

test('der Rangwaechter greift auch auf dem Kaskadenweg', async () => {
    /* GEFUNDEN LIVE (Pruefagent, 26.09.2026): Meta Call → bearbeitete
       Prognose → „1 · The field" zeigte „Crustle 4.0 %" und „Mega
       Excadrill 4.0 %" mit den Rangziffern 06 und 07 darueber. Das Bild
       behauptete eine Ordnung, die die Zahlen nicht hergeben.
       `rangPruefen` sass nur in `DsPostQuellen.lade` — dem Weg, den die
       Seite bis zur Kaskade ging. */
    const Q = fenster();
    const erg = await (await Q.kaskade(['metacall', 'eigen', '0', 'feld'])).blatt.lade();
    const werte = String(erg.zeilen).split('\n').filter(Boolean)
        .map((z) => (z.split('|')[1] || '').trim());
    const doppelt = werte.length !== new Set(werte).size;
    assert.ok(doppelt,
        'im Muster liegen keine zwei Werte gleichauf — dann prüft diese ' +
        'Zusicherung den Fall nicht, den sie halten soll');
    assert.equal(erg.ohneRang, true,
        `zwei gleiche Werte (${werte.join(', ')}) bekommen trotzdem Rangziffern`);
});

test('ein abgewiesener Abruf wird nicht gemerkt', async () => {
    /* Am Telefon — dem bestellten Fall — ist ein Funkloch der Normalfall.
       Vorher blieb das abgewiesene Versprechen stehen und BEIDE
       Listen-Ketten waren bis zum Neuladen tot (Pruefagent 26.09.2026). */
    let anlauf = 0;
    const gut = LISTEN();
    const Q = fenster({ fetchListen: () => {
        anlauf++;
        return anlauf === 1
            ? Promise.resolve({ ok: false, status: 503 })
            : Promise.resolve({ ok: true, status: 200,
                                json: () => Promise.resolve(gut),
                                text: () => Promise.resolve(JSON.stringify(gut)) });
    } });
    await assert.rejects(() => Q.postListen(), /503/);
    const j = await Q.postListen();
    assert.equal(Object.keys(j.sieben_tage).length, 2,
        'nach dem zweiten Anlauf kommt immer noch der alte Fehlschlag');
    assert.equal(anlauf, 2, `es gab ${anlauf} Abrufe`);
});

test('„my call" steht nur ueber eigenen Schaetzungen', async () => {
    /* `staende.eigen` wird auch gerechnet, wenn im Szenario keine eigene
       Schaetzung steckt — dann stehen dort die Zahlen des Modells. Der
       Waehler sagte es ehrlich („— no own estimates"), das BILD sagte
       weiter „my call %". (Pruefagent, 26.09.2026) */
    const Q = fenster();
    const mit = await (await Q.kaskade(['metacall', 'eigen', '0', 'feld'])).blatt.lade();
    const ohne = await (await Q.kaskade(['metacall', 'eigen', '1', 'feld'])).blatt.lade();
    assert.equal(mit.listeKopf, 'my call %',
        `mit eigenen Schätzungen steht: ${mit.listeKopf}`);
    assert.equal(ohne.listeKopf, 'predicted %',
        `ohne eigene Schätzungen steht trotzdem: ${ohne.listeKopf}`);
    assert.ok(!/I expect/.test(ohne.caption),
        `die Unterschrift behauptet eine eigene Erwartung: ${ohne.caption}`);
});

test('der Meta Call trennt Modellprognose und bearbeitete Prognose', async () => {
    /* „da habe ich dann die Möglichkeit zu wählen zwischen
       Standardprognose oder bearbeiteter Prognose, und dann bei der
       bearbeiteten Prognose werden dann meine gespeicherten Metacalls
       angezeigt." */
    const Q = fenster();
    const k = await Q.kaskade(['metacall']);
    assert.equal(k.stufen[1].frage, 'Forecast',
        `die zweite Stufe fragt nicht nach der Prognose: ${k.stufen[1].frage}`);
    assert.deepEqual(k.stufen[1].optionen.map((o) => o.id), ['standard', 'eigen'],
        'die zwei Prognosen stehen nicht zur Wahl');

    /* Bearbeitet -> die gespeicherten Meta Calls, DANN die Scheibe. */
    const e = await Q.kaskade(['metacall', 'eigen']);
    assert.equal(e.stufen[2].frage, 'Saved forecast',
        `nach „bearbeitet" kommt nicht die Szenarienwahl: ${e.stufen[2].frage}`);
    assert.deepEqual(namen(e.stufen[2]).map((n) => n.split(' —')[0]),
        ['Regional Frankfurt September 2026', 'League Cup Mainz September 2026'],
        'nicht alle gespeicherten Meta Calls stehen zur Wahl');
    assert.equal(e.stufen[3].frage, 'Slide',
        `nach dem Szenario kommt nicht die Scheibenwahl: ${e.stufen[3].frage}`);

    /* Standard -> direkt die Scheibe, kein Szenario dazwischen. */
    const st = await Q.kaskade(['metacall', 'standard']);
    assert.equal(st.stufen[2].frage, 'Slide',
        `bei der Modellprognose steht eine Stufe zu viel: ${st.stufen[2].frage}`);

    /* Und die beiden zeigen verschiedene Zahlen — sonst waeren es zwei
       Eintraege hinter derselben Rechnung. */
    const a = await (await Q.kaskade(['metacall', 'standard', 'feld'])).blatt.lade();
    const b = await (await Q.kaskade(['metacall', 'eigen', '0', 'feld'])).blatt.lade();
    assert.notEqual(a.zeilen, b.zeilen,
        'Modellprognose und bearbeitete Prognose liefern dieselben Zeilen');
});

test('die Scheibenwahl bietet das Karussell und die einzelnen Features', async () => {
    /* „und dann muss ich da halt wählen können zwischen den einzelnen
       Unterfeatures im Metacall quasi, ob jetzt alle angezeigt werden
       sollen im Karussell oder nur ein Feature davon." */
    const Q = fenster();
    const k = await Q.kaskade(['metacall', 'eigen', '0']);
    const ids = k.stufen[3].optionen.map((o) => o.id);
    assert.equal(ids[0], 'alle',
        `das Karussell steht nicht an erster Stelle: ${ids.join(', ')}`);
    assert.match(k.stufen[3].optionen[0].name, /carousel/i,
        `die erste Option nennt das Karussell nicht: ${k.stufen[3].optionen[0].name}`);
    ['feld', 'meindeck', 'begegnungen', 'matchups', 'empfehlungen'].forEach((s) => {
        assert.ok(ids.includes(s), `die Scheibe ${s} fehlt in der Auswahl: ${ids.join(', ')}`);
    });
    /* Das Karussell-Blatt traegt die Reihenfolge fuer den Knopf. */
    const alle = await (await Q.kaskade(['metacall', 'eigen', '0', 'alle'])).blatt.lade();
    assert.ok((alle.karussell || []).length > 1,
        'das Karussell-Blatt bringt keine Reihenfolge mit');
});

test('kein Meta-Call-Blatt zeigt die Scheiben ein zweites Mal', async () => {
    /* GEFUNDEN BEIM BAU: `bauen()` haengt an jede Scheibe `filter` — die
       Liste der fuenf Scheiben. Die Oberflaeche haengt einen Waehler an,
       sobald ein Ergebnis `filter` und `proFilter` traegt. Beides
       zusammen hiesse: die fuenf Scheiben als Unterfilter UND darunter
       noch einmal als „Card filter". */
    const Q = fenster();
    for (const b of await alleBlaetter(Q)) {
        if (b.pfad[0] !== 'metacall') continue;
        let erg;
        try { erg = await b.blatt.lade(); } catch (e) { continue; }
        assert.ok(!erg.filter,
            `${b.pfad.join(' / ')}: das Blatt traegt noch eine Scheibenliste — ` +
            'die Oberflaeche zeigt sie damit zweimal');
        assert.ok(typeof erg.proFilter === 'function',
            `${b.pfad.join(' / ')}: ohne proFilter kann der Karussell-Knopf nichts`);
    }
});

test('das Battle Journal fuehrt direkt auf die Turniere', async () => {
    /* „dann brauchen wir als nächstes einen Main-Filter Battle Journal,
       und da kann ich dann einfach das entsprechende Turnier auswählen." */
    const Q = fenster();
    const k = await Q.kaskade(['journal']);
    assert.equal(k.stufen.length, 2,
        `das Journal braucht ${k.stufen.length} Stufen, bestellt war eine Wahl`);
    assert.equal(k.stufen[1].frage, 'Tournament',
        `die Stufe fragt nicht nach dem Turnier: ${k.stufen[1].frage}`);
    assert.deepEqual(namen(k.stufen[1]),
        ['Frankfurt Sep 2026', 'League Cup Mainz Sep 2026'],
        'nicht alle übergebenen Turniere stehen zur Wahl');
    const erg = await k.blatt.lade();
    assert.match(erg.fuss, /1-0-0/, `die Bilanz fehlt in der Fußzeile: ${erg.fuss}`);
});

/* ══ 3 · WAS EIN BLATT LIEFERN DARF ════════════════════════════════ */

test('jedes Blatt liefert ein vollstaendiges Bild oder einen Befund', async () => {
    const Q = fenster();
    const K = Q.KICKER_MAX;
    assert.equal(K, 40, 'die gemessene Kickergrenze ist nicht mehr 40');
    const blaetter = await alleBlaetter(Q);
    assert.ok(blaetter.length > 20,
        `nur ${blaetter.length} Blätter — der Gang durch den Baum greift nicht`);
    for (const b of blaetter) {
        let erg = null, fehler = null;
        try { erg = await b.blatt.lade(b.pfad); } catch (e) { fehler = e; }
        const weg = b.pfad.join(' / ');
        if (!erg) {
            assert.ok(fehler && String(fehler.message || fehler).trim().length > 10,
                `${weg}: liefert weder Bild noch verständlichen Befund`);
            continue;
        }
        if (erg.proDeck) erg = erg.proDeck(erg.decks[0]);
        assert.ok(String(erg.titel || '').trim(), `${weg}: ohne Titel`);
        assert.ok(String(erg.fuss || '').trim(), `${weg}: ohne Fußzeile`);
        /* Dieselben zwei Klippen wie in test-post-quellen.js: `malListe`
           clippt den Wert bei zwölf Zeichen, die Fußzeile bei 48. */
        assert.ok(erg.fuss.length <= 48,
            `${weg}: die Fußzeile hat ${erg.fuss.length} Zeichen (Grenze 48): ${erg.fuss}`);
        /* DER KICKER FASST VIERZIG (26.09.2026, live nachgemessen).
         *
         * Gefunden, weil es im Bild stand: „MEGA EXCADRILL · TOP 8 ·
         * LAST 7 DAYS · O." — und beim Major fiel das Datum ganz weg.
         * `malKopf` sperrt den Kicker, verkleinert ihn bis 15 px und
         * schneidet dann bei 660 px; 40 Zeichen messen dort 652 px, 42
         * messen 685. Die Grenze steht als KICKER_MAX neben FUSS_MAX. */
        assert.ok(String(erg.kicker || '').length <= K,
            `${weg}: der Kicker hat ${erg.kicker.length} Zeichen (Grenze ${K}) ` +
            `und wird stumm abgeschnitten: ${erg.kicker}`);
        zeilenVon(erg).forEach((z) => {
            assert.ok(z.wert.length <= 12,
                `${weg}: „${z.wert}" hat ${z.wert.length} Zeichen, die Spalte fasst 12`);
        });
    }
});

test('die Auswahl nennt die Stuecke, die nicht mehr in den Speicher passten', async () => {
    /* VERFAELSCHUNGSPROBE, DIE NICHT BISS (Pruefagent, 26.09.2026):
       `mitGekuerzt` liess sich neutralisieren, ohne dass etwas rot wurde
       — die einzige Sicherung war ein Textgriff nach dem Wort
       „mitGekuerzt" im Quelltext. Genau das Muster, das CLAUDE.md
       verbietet. Hier wird der Fall stattdessen HERGESTELLT: ein
       Bestand, der nicht ganz passt. */
    const Q = fenster({ bestandBauen: (ctx) => {
        const U = ctx.window.DsPostUebergabe;
        const gross = (n) => {
            const karten = {};
            for (let i = 0; i < 2600; i++) karten[`Karte ${n}-${i} (SVI ${i})`] = 1;
            return { titel: 'Deck ' + n, daten: { titel: 'Deck ' + n, karten, bilder: {} } };
        };
        const rein = [];
        for (let n = 0; n < 12; n++) rein.push(gross(n));
        const erg = U.bestandLegen('deck', rein);
        assert.ok(erg.gekuerzt > 0, 'der Bestand wurde gar nicht gekürzt');
    } });
    const k = await Q.kaskade(['decks', 'meine']);
    const letzte = k.stufen[2].optionen[k.stufen[2].optionen.length - 1];
    assert.match(letzte.name, /more decks did not fit/,
        `die Auswahl verschweigt die weggelassenen Decks: ${letzte.name}`);
    assert.match(letzte.name, /\d/, `die Zahl fehlt: ${letzte.name}`);
    /* Und der Eintrag ist keine Sackgasse: er sagt beim Laden, was zu
       tun ist. Erreicht wird er ueber den Pfad, nicht ueber die
       Stufenliste — die traegt nur Kennung und Namen. */
    const b = await Q.kaskade(['decks', 'meine', 'gekuerzt']);
    assert.equal(b.stufen[2].wahl, 'gekuerzt');
    await assert.rejects(() => b.blatt.lade(), /left out|Posts page/,
        'der Hinweis erklärt nicht, wie man an das fehlende Deck kommt');
});

test('ohne Uebergabe sagt jede eigene Kette, was zu tun ist', async () => {
    const Q = fenster({ ohneBestand: true, art: 'deck' });
    for (const weg of [['decks', 'meine'], ['journal']]) {
        const k = await Q.kaskade(weg);
        assert.ok(k.blatt, `${weg.join('/')}: kein Blatt, also auch keine Meldung`);
        await assert.rejects(() => k.blatt.lade(),
            (e) => /handed over/i.test(String(e.message)),
            `${weg.join('/')}: der Hinweis nennt den Weg nicht`);
    }
});

test('fehlt die abgeleitete Datei, bleibt es bei einem Befund', async () => {
    /* Die Datei entsteht beim Deploy. Fehlt sie — neuer Zweig, erster
       Lauf, Netzfehler —, darf daraus kein leeres Bild mit erfundener
       Überschrift werden. */
    const Q = fenster({ listen: null });
    const k = await Q.kaskade(['decks', 'sieben']);
    /* Der Hauptfilter und die Quellenwahl bleiben bedienbar — der
       Ausfall steht in DER Stufe, die ihn hat. */
    assert.equal(k.stufen[0].wahl, 'decks', 'der Hauptfilter ist mitgefallen');
    assert.equal(k.stufen[1].wahl, 'sieben', 'die Quellenwahl ist mitgefallen');
    assert.match(k.stufen[2].optionen[0].name, /not available/i,
        `die Stufe verschweigt den Ausfall: ${k.stufen[2].optionen[0].name}`);
    assert.ok(k.blatt, 'ohne Datei steht gar kein Blatt da');
    await assert.rejects(() => k.blatt.lade(), /post_decklists|HTTP 404/,
        'der Ausfall der abgeleiteten Datei wird verschwiegen');
});

/* ══ 4 · DIE OBERFLÄCHE ════════════════════════════════════════════ */

test('die Seite fuellt den Hauptfilter aus dem Baum', () => {
    assert.match(SEITE, /DsPostQuellen\.BAUM\.forEach/,
        'der Hauptfilter wird nicht aus dem Baum gefüllt');
    assert.ok(!/DsPostQuellen\.liste\(\)\.forEach/.test(SEITE),
        'die Seite füllt den Wähler noch aus der flachen Quellenliste');
    assert.match(SEITE, /id="unterfilter"/,
        'es gibt keinen Platz für die Unterfilter');
    assert.match(SEITE, /kaskadeAnwenden\(\[q\.value\]\)/,
        'der Hauptfilter startet die Kaskade nicht');
});

test('ein Griff an eine Stufe verwirft nur, was darunter lag', () => {
    /* Sonst bliebe „Dragapult" stehen, wenn er von „letzte 7 Tage" auf
       „Last Major" wechselt — und der Wähler zeigte einen Archetyp, den
       diese Quelle nicht kennt. */
    assert.match(SEITE, /aktPfad\.slice\(0,\s*tiefe\)\.concat\(\[sel\.value\]\)/,
        'ein Wechsel in der Mitte nimmt die tieferen Stufen mit');
});

test('die Uebergabe wird beim Oeffnen erkannt', () => {
    /* Die App öffnet posts/index.html#uebergabe. Bis zum 26.09.2026 las
       die Seite das Kreuz nicht — das Deck lag im Speicher, und der
       Betreiber musste den Wähler selbst finden. */
    assert.match(SEITE, /location\.hash[\s\S]{0,120}uebergabe/,
        'die Seite liest das Kreuz der Übergabe nicht');
    ['deck', 'turnier', 'metacall'].forEach((art) => {
        assert.match(SEITE, new RegExp(art + ':\\s*\\['),
            `für die Art ${art} kennt die Seite keinen Zweig`);
    });
});

test('kein Hinweis auf der Seite nennt einen Eintrag, den es nicht mehr gibt', () => {
    /* Der Deckliste-Reiter erklaerte bis zum 26.09.2026: „Pick the source
       ‚From the app'". Diesen Eintrag gibt es im Waehler nicht mehr — er
       ist in zwei Ketten aufgegangen. Eine Anleitung, die auf einen
       Eintrag zeigt, den man nicht findet, ist schlimmer als keine. */
    /* Kommentare zaehlen nicht — weder die des HTML noch die des
       Skripts darin. Der erste Anlauf fiel ueber einen Absatz, der die
       alte Bezeichnung nur ERKLAERTE. */
    const text = SEITE.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
        /* Und der Zeilenumbruch im Absatz zaehlt auch nicht: der Weg
           steht im Quelltext ueber zwei Zeilen, im Browser in einer. */
        .replace(/<\/?b>/g, '').replace(/\s+/g, ' ');
    assert.ok(!/From the app/.test(text),
        'die Seite erklaert noch den Eintrag „From the app", den es nicht mehr gibt');
    /* Und die zwei anderen Hinweise nennen den WEG, nicht nur den Namen:
       „Matchup heatmap" allein findet man in einem Waehler nicht mehr,
       der nur acht Richtungen zeigt. */
    ['Online meta → Matchup heatmap', 'Online meta → A deck vs. the'].forEach((w) => {
        assert.ok(text.indexOf(w) >= 0, `der Hinweis nennt den Weg nicht: ${w}`);
    });
    const i = text.indexOf('<legend>Decklist</legend>');
    assert.ok(i > 0, 'den Deckliste-Reiter gibt es nicht mehr');
    const block = text.slice(i, i + 900);
    ['My decks', 'Most successful lists', 'Last major', 'Battle Journal']
        .forEach((k) => assert.ok(block.indexOf(k) >= 0,
            `der Hinweis nennt die Kette „${k}" nicht`));
});

test('der Karussell-Knopf kehrt ueber den Pfad zurueck, nicht ueber den Kartenfilter', () => {
    assert.match(SEITE, /knopf\.disabled = false;[\s\S]{0,400}kaskadeAnwenden\(aktPfad\)/,
        'nach dem Karussell wird der alte Kartenfilter angewandt — bei einem ' +
        'Meta Call trägt er nichts mehr');
});
