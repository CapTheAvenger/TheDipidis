/**
 * Abnahme vom 05.09.2026 — was neun Prüfagenten auf der Live-Seite fanden.
 *
 * Diese Datei sichert genau die Stellen, an denen eine Zahl falsch auf dem
 * Bildschirm stand oder ein Bedienelement stumm war. Jede Zusicherung nennt
 * den gemessenen Befund, damit man beim nächsten Umbau sieht, was sie hält.
 *
 * Der rote Faden: eine Reparatur, die an drei Stellen ankommt und an fünf
 * nicht, ist keine Reparatur. `win_pct` wurde am 03./04.09. in der Heatmap,
 * im Past Meta und in den Post-Bildern auf die Bilanz umgestellt — der Meta
 * Call blieb stehen, und dort wird die Zahl nicht nur angezeigt, sondern in
 * die Day-2-Chance weitergerechnet.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const METACALL   = lies('js/app-meta-call.js');
const QUICKREF   = lies('js/current-meta-quickref.js');
const EMPFEHLUNG = lies('js/app-deckempfehlung.js');
const METACARDS  = lies('js/app-meta-cards.js');
const ANALYSE    = lies('js/app-current-meta-analysis.js');
const BAUER      = lies('js/app-deck-builder.js');
const KONSIST    = lies('js/deck-builder-consistency.js');
const MATCHUPS   = lies('js/app-side-quest-matchups.js');
const NUTZUNG    = lies('js/app-side-quest-usage.js');
const FEATURES   = lies('js/app-features.js');
const SCRAPER    = lies('backend/scrapers/current_meta_analysis_scraper.py');
const SCHLIESS   = lies('css/close-buttons.css');
const SIDEQUEST  = lies('css/side-quest.css');
const STYLES     = lies('css/styles.css');

/* ══════════════════════════════════════════════════════════════════════
   1. MATCHPUNKTE SIND KEINE WIN RATE
   ══════════════════════════════════════════════════════════════════════ */

describe('Meta Call: die Bilanz statt der Matchpunktspalte', () => {

    it('keine der drei Deck-Spalten wird mehr direkt als Quote gelesen', () => {
        // Gemessen am 05.09.2026 über alle 4.711 Zeilen von
        // data/labs_tournament_decks.csv: win_pct weicht von der
        // Matchpunktquote (3S+U)/3n im Mittel um 0,0025 Punkte ab, von
        // S/(S+N) um 2,1476. Die Spalte IST die Matchpunktquote.
        for (const spalte of ['win_pct', 'day1_win_pct', 'day2_win_pct']) {
            assert.ok(
                !new RegExp(`parseEU\\(r\\.${spalte}`).test(METACALL),
                `r.${spalte} wird wieder direkt als Quote gelesen — das sind Matchpunkte`);
        }
    });

    it('es gibt einen benannten Rechenweg aus der Bilanz', () => {
        assert.match(METACALL, /function _labsDeckWr\(r, praefix\)/);
        assert.match(METACALL, /function _labsDeckPartien\(r, praefix\)/);
        // S/(S+N+U) — dieselbe Konvention wie limitless_online_decks.csv,
        // gegen die der Wert verrechnet wird.
        assert.match(METACALL, /var partien = s \+ n \+ \(u \|\| 0\);/);
        assert.match(METACALL, /return \(s \/ partien\) \* 100;/);
    });

    it('fehlende Bilanz ergibt null, nicht null Prozent', () => {
        // "Leer ist leer": aus Matchpunkten eine Win Rate zu schätzen
        // wäre eine Behauptung. Die zwölf abgeschlossenen Epochen der
        // Matchup-Datei tragen keine Bilanz.
        assert.match(METACALL, /if \(s == null \|\| n == null\) return null;/);
    });

    it('die Paarquote nimmt die Bilanz, wo es eine gibt', () => {
        assert.match(METACALL, /const vsS = _labsGanz\(r\.vs_wins\);/);
        assert.match(METACALL, /const vsN = _labsGanz\(r\.vs_losses\);/);
        assert.match(METACALL, /const hatBilanz = vsS != null && vsN != null && \(vsS \+ vsN\) > 0;/);
        assert.match(METACALL, /z\.siege \+= vsS;/);
    });

    it('sie wirft die Paare der abgeschlossenen Epochen NICHT weg', () => {
        /* Gemessen 05.09.2026: von 47.896 Zeilen in
           data/labs_tournament_matchups.csv tragen 1.776 eine Bilanz,
           und die alle aus TEF-PBL. Die Zeilen ohne Bilanz zu
           ueberspringen hat den Past-Meta-Zweig leergeraeumt und den
           Deploy angehalten:
             "Past meta TEF-CRI has no matchup pairs loaded — the
              resulting PNG would show identical 50/50 placeholder
              recommendations."
           TEF-CRI hat 690 Paare mit vs_count >= 10; die duerfen nicht
           verschwinden, nur weil sie eine andere Konvention tragen. */
        assert.match(METACALL, /z\.punkteSumme \+= games \* \(Number\.isFinite\(vsPunkte\) \? vsPunkte : 0\);/);
        assert.match(METACALL, /winPct = a\.punkteSumme \/ a\.games;/);
    });

    it('beide Fälle tragen ihre Konvention', () => {
        assert.match(METACALL, /konvention = 'ohneUnentschieden';/);
        assert.match(METACALL, /konvention = 'matchpunkte';/);
        assert.match(METACALL, /nurPunkte : !hatBilanz,/);
    });

    it('mit Bilanz wird geglättet wie die Heatmap', () => {
        // Ohne denselben Prior sähe eine Paarung aus 11 Partien aus wie
        // eine aus 1.049.
        assert.match(METACALL, /G\.quote\(a\.siege, a\.niederlagen\)/);
    });

    it('die Rückgabe trägt die Bilanz mit — oder ehrlich null', () => {
        assert.match(METACALL, /siege {2}: hatBilanz \? a\.siege : null,/);
        assert.match(METACALL, /entschieden : hatBilanz \? entschieden : null,/);
    });

    it('die Spiegelung 100 - x gilt nicht für Matchpunkte', () => {
        // Für Matchpunkte gilt wp(A,B) + wp(B,A) = 100 - 100·U/(3n).
        // Gemessen über die TEF-PBL-Paare mit vs_count >= 10:
        // `100 - wp_rev` überschätzte im Mittel um 3,54 pp, maximal 10,26.
        // Dort wird lieber gar nichts geliefert als eine geschönte Zahl.
        assert.match(METACALL, /if \(reverse\.nurPunkte\) return null;/);
        assert.match(METACALL, /100 - reverse\.winPct/);
    });
});

describe('Meta Call: die Paar-Aggregation an der echten Datei', () => {

    /* Diese Probe hat der rote Deploy vom 05.09.2026 erzwungen. Die
       erste Fassung der Reparatur uebersprang jede Zeile ohne Bilanz —
       und die zwoelf abgeschlossenen Epochen tragen keine. Der
       Vorab-Renderer des Telegram-Bots hat es gemeldet und den Deploy
       angehalten, nicht ein Test.

       Geprueft wird eine EIGENSCHAFT: dass die Aggregation fuer ein
       abgeschlossenes Format ueberhaupt Paare liefert und fuer das
       laufende Format die Bilanz nimmt. Welche Zahlen dort stehen, ist
       der Pruefung egal. */
    const csv = lies('data/labs_tournament_matchups.csv').replace(/^\uFEFF/, '');

    function aggregiere(minGames) {
        // Anfuehrungszeichen-bewusst wie parseCSVQuoted im Motor: die
        // Turniernamen enthalten Kommas ("NAIC 2026, New Orleans").
        const zerlege = (zeile) => {
            const raus = [];
            let feld = '';
            let inZitat = false;
            for (let i = 0; i < zeile.length; i++) {
                const c = zeile[i];
                if (inZitat) {
                    if (c === '"') {
                        if (zeile[i + 1] === '"') { feld += '"'; i += 1; }
                        else inZitat = false;
                    } else feld += c;
                } else if (c === '"') inZitat = true;
                else if (c === ',') { raus.push(feld); feld = ''; }
                else feld += c;
            }
            raus.push(feld);
            return raus;
        };
        const zeilen = csv.split(/\r?\n/).filter(Boolean);
        const kopf = zerlege(zeilen[0]);
        const bei = (n) => kopf.indexOf(n);
        const ganz = (v) => {
            const t = String(v == null ? '' : v).trim();
            if (t === '') return null;
            const n = parseInt(t, 10);
            return Number.isFinite(n) && n >= 0 ? n : null;
        };
        const agg = {};
        for (let i = 1; i < zeilen.length; i++) {
            const f = zerlege(zeilen[i]);
            if (f.length < kopf.length) continue;
            if (String(f[bei('day_filter')] || 'overall').trim().toLowerCase() !== 'overall') continue;
            const meta = String(f[bei('meta')] || '').trim().toUpperCase();
            const a = String(f[bei('my_deck_name')] || '').trim();
            const b = String(f[bei('opponent_deck_name')] || '').trim();
            if (!meta || !a || !b) continue;
            const games = parseInt(f[bei('vs_count')] || '0', 10);
            if (!Number.isFinite(games) || games <= 0) continue;
            const S = ganz(f[bei('vs_wins')]);
            const N = ganz(f[bei('vs_losses')]);
            const hatBilanz = S != null && N != null && (S + N) > 0;
            agg[meta] = agg[meta] || {};
            const k = a + '\u0000' + b;
            const z = agg[meta][k] = agg[meta][k] || { games: 0, mit: 0 };
            z.games += games;
            if (hatBilanz) z.mit += games;
        }
        const raus = {};
        for (const meta of Object.keys(agg)) {
            let paare = 0, mit = 0;
            for (const k of Object.keys(agg[meta])) {
                const z = agg[meta][k];
                if (z.games < minGames) continue;
                paare += 1;
                if (z.mit > 0) mit += 1;
            }
            raus[meta] = { paare, mit };
        }
        return raus;
    }

    it('ein abgeschlossenes Format behält seine Paare', () => {
        // MAJOR_MATCHUP_MIN_GAMES_PAST = 3
        const a = aggregiere(3);
        assert.ok(a['TEF-CRI'] && a['TEF-CRI'].paare > 0,
            'TEF-CRI hat keine Paare mehr — genau der Zustand, den der '
            + 'Vorab-Renderer als "no matchup pairs loaded" gemeldet und '
            + 'mit dem er den Deploy angehalten hat');
        assert.equal(a['TEF-CRI'].mit, 0,
            'TEF-CRI hätte plötzlich Bilanzspalten — dann stimmt die '
            + 'Begründung im Quelltext nicht mehr');
    });

    it('das laufende Format rechnet aus der Bilanz', () => {
        const a = aggregiere(10);
        assert.ok(a['TEF-PBL'] && a['TEF-PBL'].paare > 0, 'TEF-PBL hat keine Paare');
        assert.equal(a['TEF-PBL'].mit, a['TEF-PBL'].paare,
            'nicht alle TEF-PBL-Paare tragen eine Bilanz — dann fiele ein '
            + 'Teil des laufenden Formats auf Matchpunkte zurück');
    });
});

describe('Meta Call: jede Quote trägt ihren Nenner', () => {

    it('der Nenner der Online-Paarung wird nicht mehr weggeworfen', () => {
        // total_games steht in derselben CSV-Zeile.
        assert.match(METACALL, /_matchupMap\[dk\]\[ok\] = \{ pWin, pTie, pLoss, partien, quote, roh \};/);
    });

    it('er überlebt Mischung, Journal und Korrektur', () => {
        assert.match(METACALL, /partien: base\.partien \|\| 0/);
        assert.match(METACALL, /partien: \(metaBase\.partien \|\| 0\) \+ js\.total/);
    });

    it('die Begegnungsliste zeigt ihn an', () => {
        // Aus genau diesen Zeilen entsteht die Day-2-Chance. Ohne
        // Partienzahl war "WR 13 %" von "WR 73 %" nicht zu unterscheiden.
        assert.match(METACALL, /const wrN {4}= m\.handEingestellt/);
        assert.match(METACALL, /WR \$\{wrPct\}\$\{_mcPz\(\)\}\$\{wrN\}/);
    });

    it('ein Paar ohne Messung bekommt keine Verschiebung und sagt es', () => {
        /* Live gemessen am 05.09.2026 nach dem ersten Durchgang:
           "Seaking Festival Lead WR 7 %" und "Alakazam Dusknoir WR 24 %"
           standen neben Zeilen mit 1.101 Partien — zu beiden Paarungen
           liegt aber KEINE Partie vor. Die Zahlen entstanden allein aus
           der Predictor-5.3-Verschiebung auf den 50/50-Platzhalter.
           Fuer 33,5 % des erwarteten Gegnerfelds gibt es online keine
           Quote. */
        assert.match(METACALL, /ohneMessung: true \}/);
        assert.match(METACALL, /if \(base\.ohneMessung\) return base;/);
        assert.match(METACALL, /t\('mc\.wrOhneMessung'\)/);
        const i18n = lies('js/i18n.js');
        const n = i18n.split("'mc.wrOhneMessung'").length - 1;
        assert.equal(n, 2, `mc.wrOhneMessung steht ${n}-mal statt zweimal in i18n.js`);
    });

    it('ein von Hand gesetzter Wert wird als solcher gekennzeichnet', () => {
        assert.match(METACALL, /handEingestellt: true/);
        assert.match(METACALL, /t\('mc\.wrManuell'\)/);
    });

    it('die kleinen WR-Chips tragen ihre Partienzahl', () => {
        /* 07.09.2026: der Chip hat einen dritten Parameter bekommen —
           die Konvention, nach der die Zahl gerechnet ist (auf derselben
           Deckzeile stehen zwei "WR", die verschiedene Formeln meinen).
           Die Zusage dieses Tests ist unveraendert: der NENNER muss
           dran sein. Sie wird jetzt am laufenden Chip geprueft statt an
           seiner Unterschrift, damit die naechste Erweiterung sie nicht
           wieder rot macht. */
        assert.match(METACALL, /function _wrChip\(wert, partien/);
        const anfang = METACALL.indexOf('function _wrChip(');
        const ende = METACALL.indexOf('\n  }', anfang);
        const chip = new Function('window', 'esc', '_wrKonventionsTitel',
            METACALL.slice(anfang, ende + 4) + ' return _wrChip;')(
            { zahlLokal: (n) => String(n) }, (x) => String(x), () => '');
        assert.equal(chip(46.4, 1181), ' (WR 46 % · 1181)',
            'ein WR-Chip rendert wieder ohne Nenner');
        assert.equal(chip(46.4, 0), ' (WR 46 %)');
        assert.equal(chip(null, 9), '');
        assert.ok(!/\(WR \$\{fmt\(/.test(METACALL),
            'ein WR-Chip rendert wieder ohne Nenner');
    });

    it('beide Sprachen kennen die neuen Schlüssel', () => {
        const i18n = lies('js/i18n.js');
        for (const k of ['mc.wrManuell', 'mc.wrNennerTitel']) {
            const treffer = i18n.split(`'${k}'`).length - 1;
            assert.equal(treffer, 2,
                `${k} steht ${treffer}-mal statt zweimal (DE und EN) in i18n.js`);
        }
    });
});

describe('Meta Call: der Vergleichsfaktor wird nicht mehr in der Anzeige geklemmt', () => {

    it('die Kachel zeigt den echten Faktor', () => {
        // Gemessen gegen data/online_tournament_top8_decks.csv
        // (Feldschnitt 5,9262 %): Mega Excadrill 22/929 = 2,368 %
        // → 0,400x, angezeigt wurde 0,5x. Toxtricity Brute Bonnet
        // 0/2 = 0,0 % → 0,000x, angezeigt 0,5x — eine Quote von null
        // neben "halb so oft wie der Schnitt" in derselben Kachel.
        assert.match(METACALL, /const convFactor = meanConv > 0 \? \(top8Conv \/ meanConv\) : 1\.0;/);
    });

    it('die Dämpfung bleibt dort, wo sie hingehört — im Modell', () => {
        assert.match(METACALL, /_clip\(top8Conv \/ meanConv, _dampLo, _dampHi\)/);
    });
});

/* ══════════════════════════════════════════════════════════════════════
   2. DIE VIERTE KONVENTION, DIE DAS HAUS VERWORFEN HAT
   ══════════════════════════════════════════════════════════════════════ */

describe('Die erfundene Win-Rate-Formel steht nirgends mehr auf dem Bildschirm', () => {

    it('das Online-Panel rechnet Matchpunkte wie das Major-Panel daneben', () => {
        // Bis zum 05.09.2026 stand hier ref.win_pct aus
        // data/online_best_decklists.json unverändert: (S + 0,5·U)/Partien.
        // Nachgerechnet über die 11 Einträge mit Unentschieden —
        // Dragapult Blaziken 13-0-1 stand mit 96,4 statt 95,2.
        assert.ok(!/\(ref\.win_pct \|\| 0\)\.toFixed/.test(QUICKREF),
            'das Online-Panel zeigt wieder ref.win_pct roh an');
        assert.match(QUICKREF, /_oWK\.KONVENTIONEN\.matchpunkte\.rechne\(ref\.wins \|\| 0, ref\.losses \|\| 0, ref\.ties \|\| 0\)/);
    });

    it('beide Kacheln tragen den Konventionshinweis', () => {
        assert.match(QUICKREF, /_oWpHinweis = _oWK \? _oWK\.hinweis\('matchpunkte'\) : ''/);
        assert.match(QUICKREF, /_qWpHinweis = _qWK \? _qWK\.hinweis\('matchpunkte'\) : ''/);
    });

    it('auch der Scraper schreibt sie nicht mehr in die Datei', () => {
        assert.ok(!/\(w \+ 0\.5 \* t\) \/ g/.test(SCRAPER),
            'der Scraper rechnet wieder (S + 0,5·U)/n — die vierte Konvention');
        assert.match(SCRAPER, /\(3 \* w \+ t\) \/ \(3 \* g\)/);
    });

    it('js/win-rate-konvention.js kennt sie weiterhin nicht', () => {
        const k = lies('js/win-rate-konvention.js');
        assert.match(k, /EINE VIERTE WAR ERFUNDEN/);
        assert.equal(Object.keys({ matchpunkte: 1, mitUnentschieden: 1, ohneUnentschieden: 1 }).length, 3);
        for (const id of ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']) {
            assert.ok(k.includes(id + ':'), `die Konvention ${id} fehlt`);
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════
   3. VERTAUSCHTE GRUNDGESAMTHEITEN
   ══════════════════════════════════════════════════════════════════════ */

describe('Grundgesamtheiten: Spieler sind keine Turniere', () => {

    it('der wichtigste Satz der Empfehlungskarte nennt Spieler, nicht Turniere', () => {
        // `empfehlung_mittel` ist day1_to_day2_conv × 100, also der Anteil
        // der SPIELER dieses Decks, die Day 2 erreichen. Der Satz sagte
        // "in 75 % der Turniere ist nach Day 1 Schluss"; dieselbe Datei
        // sagt `day2_ueberhaupt_erreicht: 43` von `turniere: 44` — also
        // 2,3 %. Faktor 33.
        assert.ok(!/% der Turniere ist nach Day 1 Schluss/.test(EMPFEHLUNG),
            'der Satz behauptet wieder einen Turnier-Anteil');
        assert.match(EMPFEHLUNG, /Spielern dieses Decks scheitern/);
        assert.match(EMPFEHLUNG, /% der Antritte, gemittelt über/);
    });

    it('der Satz trägt seinen Nenner', () => {
        assert.match(EMPFEHLUNG, /gz\(v\.turniere\)/);
    });

    it('der Kartenhinweis nennt drei Grundgesamtheiten getrennt', () => {
        /* ABNAHME 05.09.2026: der erste Anlauf hat die beiden
           Kopienzahlen getrennt, die Prozentzahl davor aber weiter als
           Listenanteil beschriftet. `metaShare` ist der ungewichtete
           Mittelwert der Nutzungsanteile ueber die Top-10-Archetypen
           (app-meta-cards.js:524), kein Listenanteil — Secret Box:
           30,0 % x 1,00 = 0,30, auf der Kachel stehen 0,12, echter
           Listenanteil 12 %. Die eigenen drei Zahlen gingen nicht auf. */
        assert.match(METACARDS, /listenAnteil: safeTotalDecksInTop10 > 0/);
        assert.match(METACARDS, /listenMit: Math\.round\(totalDecksWithCard\)/);
        // Auch nach der Variantenfusion, sonst fehlt es bei den haeufigsten Karten.
        assert.match(METACARDS, /listenMit: Math\.round\(Math\.max\(\.\.\.variants\.map/);
        assert.match(METACARDS, /Die ' \+ _kommaZahl\(a, 1\) \+ ' % davor sind etwas anderes/);
        assert.match(METACARDS, /Mittelwert '\s*\+ 'der Nutzungsanteile über die Top-10-Archetypen/);
    });

    it('die Ace-Spec-Zeile widerspricht ihrem eigenen Satz nicht mehr', () => {
        /* ABNAHME 05.09.2026: der Fliesstext sagte "Unfair Stamp steht
           in 86,7 % der ausgewerteten Praesenzlisten", die Zeile direkt
           darunter "Major: not played · Online 86.7% share". Dieselbe
           Zahl, zwei Beschriftungen, eine davon falsch. */
        assert.match(BAUER, /const _y2 = !!acePick\.quelle_text;/);
        assert.match(BAUER, /parts\.push\(`Präsenz \$\{/);
        assert.match(BAUER, /if \(!_y2\) parts\.push\(`Online /);
    });

    it('der Sammelposten "Sonstige" trägt seinen eigenen Nenner', () => {
        // 24 von 25 Zeilen hatten ihre Partienzahl, diese nicht.
        assert.match(METACALL, /junkDecks: _junkDeckZahl/);
        assert.match(METACALL, /t\('mc\.wrJunkDecks'\)/);
        const i18n = lies('js/i18n.js');
        assert.equal(i18n.split("'mc.wrJunkDecks'").length - 1, 2);
    });

    it('die Day-2-Schwelle steht im Tooltip', () => {
        // Clefairy Ogerpon (3 Day-2-Spieler) bekommt keine Rate — das
        // ist richtig, stand aber nirgends.
        const i18n = lies('js/i18n.js');
        assert.match(i18n, /weniger als 5 Day-2-Spielern dieses Decks bleiben ganz draußen/);
        assert.match(i18n, /fewer than 5 Day-2 players of this deck are left out entirely/);
    });

    it('"dort im Schnitt" liest das Feld für "dort"', () => {
        // avgCount ist totalCopies / alle Listen — daraus wurde
        // "dort im Schnitt 0,12 Kopien". Eine Karte, die in einer Liste
        // IST, ist dort mindestens einmal drin.
        assert.match(METACARDS, /var dort = Number\(card && card\.avgCountWhenUsed\) \|\| 0;/);
        assert.match(METACARDS, /Dort im Schnitt ' \+ _kommaZahl\(dort, 2\)/);
        assert.match(METACARDS, /Über alle Listen ' \+ _kommaZahl\(gesamt, 2\)/);
    });
});

/* ══════════════════════════════════════════════════════════════════════
   4. STUMME BEDIENELEMENTE
   ══════════════════════════════════════════════════════════════════════ */

describe('Deckbau: Ausschluss, Anheftung und Tech-Slots wirken wieder', () => {

    it('der Y.2-Pfad wendet die Nutzerwünsche an', () => {
        // Gemessen live: techSlots gesetzt → keine davon im Deck;
        // isExcludedCard true → 4x im Deck; isPinnedCard true → nicht im
        // Deck. Und darüber die Meldung "Build complete".
        assert.match(BAUER, /function _nutzerwuensche\(source, result\)/);
        assert.match(BAUER, /const _wunsch = _nutzerwuensche\(source, result\);/);
    });

    it('der Ausschluss gewinnt gegen die Anheftung', () => {
        assert.match(BAUER, /if \(ausgeschlossen && ausgeschlossen\.has\(k\)\) continue;/);
    });

    it('Kern und Ace Spec werden beim Trimmen nicht angetastet', () => {
        assert.match(BAUER, /if \(e\.slotType === 'core' \|\| e\.slotType === 'ace_spec'\) return false;/);
    });

    it('eine Karte ohne Kartendaten wird gemeldet, nicht halb eingebaut', () => {
        assert.match(BAUER, /nicht anwendbar \(keine Kartendaten im Archetyp\)/);
    });

    it('die Schleifen können nicht hängen', () => {
        const treffer = BAUER.match(/wache\+\+ < 200/g) || [];
        assert.equal(treffer.length, 2, 'eine der beiden Ausgleichsschleifen hat keine Wache');
    });
});

describe('Deckbau: die Kategorie-Deckung ist nicht mehr tot', () => {

    it('der Deck-Eintrag wird ausgepackt, bevor sein Typ gelesen wird', () => {
        // `kat(e)` bekam {card, count, slotType} — `e.type` gibt es dort
        // nicht, also war jede Karte 'Pokemon'.
        assert.match(KONSIST, /const k = kat\(e && e\.card \? e\.card : e\);/);
        assert.ok(!/const k = kat\(e\);/.test(KONSIST),
            'der Deck-Eintrag wird wieder ungeöffnet an kat() gegeben');
    });

    it('auch die Listenseite bekommt Typen aus der Kartendatenbank', () => {
        // Die Spalte `type` ist in allen 30.459 Zeilen von
        // tournament_decklists_per_player.csv leer.
        assert.match(KONSIST, /const cardDb = _getCardDb\(\);/);
        assert.match(KONSIST, /const typVon = \(c\) => \{/);
    });

    it('ohne Typen wird das gesagt, nicht behauptet', () => {
        assert.match(KONSIST, /raus\._unbestimmt = true;/);
        assert.match(BAUER, /if \(kats\._unbestimmt\)/);
        assert.match(BAUER, /Kategorie-Deckung nicht bestimmbar/);
    });
});

describe('Deckbau: die Datenbasis wird ehrlich beschriftet', () => {

    it('der Bau gibt die Herkunft seiner Listen heraus', () => {
        for (const feld of ['n_turniere', 'juengstes_turnier', 'platz_von', 'platz_bis']) {
            assert.ok(KONSIST.includes(feld + ':'),
                `dataQuality.${feld} fehlt — ohne Herkunft ist "8 Listen" eine halbe Angabe`);
        }
    });

    it('acht Listen aus einem Turnier sind eine Warnung, kein grüner Haken', () => {
        assert.match(BAUER, /const _duenn = _dqEntry\.decision === 'data_too_thin' \|\| _nT === 1 \|\| _nL < 12;/);
        assert.match(BAUER, /level: {3}_duenn \? 'warn' : 'info'/);
        assert.match(BAUER, /alle aus EINEM Turnier/);
    });

    it('"No recent Major in scope" ist keine Konstante mehr', () => {
        assert.ok(!/has_major_anchor: {4}false,/.test(BAUER),
            'has_major_anchor ist wieder fest auf false verdrahtet');
        assert.match(BAUER, /has_major_anchor: {4}_hatAnker,/);
        assert.match(BAUER, /_ankerAlter <= 28/);
    });

    it('der Y.2-Pfad erklärt seine Ace-Spec-Wahl mit seinen eigenen Zahlen', () => {
        assert.match(BAUER, /if \(acePick\.quelle_text\) \{/);
        assert.match(BAUER, /quelle_text: \(function \(\) \{/);
    });

    it('das Formatfenster gilt auch auf City League', () => {
        // Ohne minDate liefen dort 80 % Vorformat-Listen in den Bau.
        assert.match(BAUER, /source === 'currentMeta' \|\| source === 'cityLeague'/);
    });
});

describe('Champions-Matchups: ein Zuhörer je Element und Ereignis', () => {

    it('es gibt einen Riegel gegen Doppelbindung', () => {
        // Gemessen: 1, 1, 1, 2, 1, 3, 6, 8 ms je Tastendruck — Verdopplung.
        // Danach 813 ms in einem Ereignis, in einer zweiten Messung 1.878 ms.
        assert.match(MATCHUPS, /function binde\(el, typ, fn\)/);
        assert.match(MATCHUPS, /const marke = '_sqGebunden_' \+ typ;/);
    });

    it('nur der ersetzte Teilbaum wird neu verdrahtet', () => {
        assert.match(MATCHUPS, /list\.innerHTML = fresh\.innerHTML; wire\(list\);/);
        assert.ok(!/wire\(panel\);/.test(MATCHUPS),
            'wire() läuft wieder über das ganze Panel — dann wächst der Zuhörerstapel am Suchfeld');
    });

    it('das Suchfeld bindet über den Riegel', () => {
        assert.match(MATCHUPS, /binde\(q, 'input', \(\) => \{/);
    });
});

/* ══════════════════════════════════════════════════════════════════════
   5. WAS DIE QUELLE WEGLÄSST
   ══════════════════════════════════════════════════════════════════════ */

describe('Champions-Nutzung: unmögliche und unvollständige Verteilungen', () => {

    it('die Summe wird geprüft und genannt', () => {
        // 50 Verteilungen summieren sich auf über 100,5 % (banette 121,3),
        // 66 Attacken-Datensätze liegen unter 200 % statt bei ~400 %.
        assert.match(NUTZUNG, /function summenNote\(list, erwartet\)/);
        assert.match(NUTZUNG, /if \(summe > erwartet \+ 0\.5\) return L\(\)\.summeUeber/);
        assert.match(NUTZUNG, /if \(summe < erwartet \* 0\.9\) return L\(\)\.summeUnter/);
    });

    it('die Erwartung hängt an der Sorte — vier Attacken, ein Wesen', () => {
        // 15.09.2026: aus dem einen `moveRow` sind drei Zeilenbauer
        // geworden (moveRow / itemRow / abilityRow). Der Grund steht in
        // js/app-side-quest-usage.js — dieselbe Funktion für drei Sorten
        // hieß, dass Attacken und Fähigkeiten im GEGENSTANDS-Topf
        // nachgeschlagen wurden und auf der deutschen Seite englisch
        // blieben. Der Punkt DIESER Zusicherung ist unverändert: die
        // erwartete Summe hängt an der Sorte, 400 für vier Attacken, 100
        // für das eine Wesen und den einen Gegenstand.
        assert.match(NUTZUNG, /barPanel\(L\(\)\.moves, block\.move, moveRow, 400\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.nature, block\.nature, natRow, 100\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.item, block\.held_item, itemRow, 100\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.ability, block\.ability, abilityRow, 100\)/);
    });

    it('beide Sprachen haben die Sätze', () => {
        for (const k of ['summeUeber', 'summeUnter']) {
            const n = NUTZUNG.split(k + ':').length - 1;
            assert.equal(n, 2, `${k} steht ${n}-mal statt zweimal (DE und EN)`);
        }
    });
});

describe('Champions-Nutzung: Regionalformen finden ihre Daten', () => {

    // BEFUND 08.09.2026 — DER KOMMENTAR HIER WAR FALSCH, UND DAS HAT
    // MAIN ROT GEMACHT.
    //
    // Er behauptete, die Zusicherung prüfe „eine EIGENSCHAFT der
    // Namensumrechnung, keinen Wochenwert … Welche Pokémon diese Woche
    // dort stehen, ist ihr egal." Genau das stimmte nicht: die zweite
    // Zusicherung verlangte, dass der errechnete Schlüssel auch in
    // data/champions_usage.json STEHT — und diese Datei wird
    // wöchentlich neu gescrapt.
    //
    // Am 08.09.2026 führte sie 236 Schlüssel, darunter `maushold`, aber
    // nicht mehr `maushold-family-of-four`. Folge: Deploy-Läufe 2795,
    // 2796 und 2797 rot, `build` und `deploy` übersprungen, die Seite
    // hing auf dem alten Stand — ohne dass jemand etwas geändert hätte.
    // Genau der Fall, vor dem CLAUDE.md unter „Absolute quality
    // thresholds produce noise here" warnt.
    //
    // Die Trennung ist jetzt sauber:
    //   - Die UMRECHNUNG wird für JEDEN Fall geprüft. Sie ist Code und
    //     hat mit der Woche nichts zu tun.
    //   - Die ABDECKUNG wird nur für die Fälle geprüft, die diese Woche
    //     überhaupt in der Datei stehen — mit einer Untergrenze, damit
    //     die Zusicherung nicht lautlos leerläuft, wenn die Datei einmal
    //     gar nichts mehr hergibt.
    const usage = JSON.parse(lies('data/champions_usage.json')).pokemon;
    const quelle = NUTZUNG.match(/var USAGE_REGION[\s\S]*?\n {4}function usageSlug\(name\) \{[\s\S]*?\n {4}\}/);

    it('der Rechenweg ist auffindbar', () => {
        assert.ok(quelle, 'usageSlug/usageKandidaten sind nicht mehr als Block lesbar');
    });

    // Gemessen am 05.09.2026: 17 von 86 Zeilen der Rangliste fanden
    // ihre Daten nicht — alle Regionalformen und alle Mega-Formen.
    const FAELLE = [
        ['Ninetales-Alola',  'alolan-ninetales'],
        ['Decidueye-Hisui',  'hisuian-decidueye'],
        ['Zoroark-Hisui',    'hisuian-zoroark'],
        ['Slowbro-Galar',    'galarian-slowbro'],
        ['Lycanroc-Dusk',    'lycanroc-dusk-form'],
        ['Maushold-Four',    'maushold-family-of-four'],
        ['Gallade-Mega',     'mega-gallade'],
    ];

    it('die Umrechnung BIETET den richtigen Schluessel an — vor der Grundform', () => {
        /* DIE WOCHENUNABHAENGIGE EIGENSCHAFT, und zwar die richtige.
           usageSlug() nimmt den ERSTEN Kandidaten, den der
           Nutzungsstand kennt (js/app-side-quest-usage.js:243 ff.) —
           sein Ergebnis haengt also zwangslaeufig an der Datei. Was
           NICHT an ihr haengt, ist die Kandidatenliste: sie kommt
           allein aus dem Namen.

           Zwei Dinge muessen dort stimmen, und beide sind reiner Code:
           der richtige Schluessel muss ueberhaupt angeboten werden, und
           er muss VOR der blossen Grundform stehen. Stuende er dahinter,
           bekaeme „Ninetales-Alola" die Zahlen von „ninetales" — und
           genau davor warnt der Kommentar an der Ausweichzeile
           („sonst stuende die Zahl der Grundform unter dem Namen einer
           anderen"). */
        const kand = new Function('_usage', quelle[0] + '; return usageKandidaten;')({});
        for (const [name, erwartet] of FAELLE) {
            const liste = kand(name);
            const i = liste.indexOf(erwartet);
            assert.ok(i >= 0,
                `${name} bietet ${erwartet} gar nicht an — angeboten wird: ${liste.join(', ')}`);
            const grundform = liste.indexOf(String(name).toLowerCase().split('-')[0]);
            if (grundform >= 0) {
                assert.ok(i < grundform,
                    `${name} bietet die Grundform (${liste[grundform]}) VOR ${erwartet} an — `
                    + 'dann bekaeme die Form die Zahlen der Art');
            }
            /* DOPPELFREI — sonst laesst sich die Liste nicht pruefen.
               Steht ein Schluessel zweimal drin, kann die Regel, die
               ihn erzeugt, ersatzlos entfallen, ohne dass sich etwas
               aendert. Genau das ist am 08.09.2026 in einer
               Mutationsprobe passiert: zwei Regeln lieferten
               "alolan-ninetales" bzw. "mega-gallade", und das Streichen
               der einen blieb folgenlos. */
            const doppelt = liste.filter((x, k) => liste.indexOf(x) !== k);
            assert.deepEqual([...new Set(doppelt)], [],
                `${name} bietet Schluessel doppelt an: ${[...new Set(doppelt)].join(', ')}`);
        }
    });

    it('Mega-Formen bieten BEIDE Schreibweisen an', () => {
        /* Nachgemessen am 08.09.2026: bei "charizard-mega-y" liefern die
           zwei Mega-Regeln Verschiedenes — "mega-charizard" und
           "mega-charizard-y". Beides kommt in Nutzungsstaenden vor, je
           nachdem ob die Quelle die Mega-Formen trennt. Ich hatte die
           erste Regel fuer redundant gehalten und wollte sie streichen;
           der Vergleich der Kandidatenlisten hat es gezeigt. Diese
           Zusicherung haelt das fest. */
        const kand = new Function('_usage', quelle[0] + '; return usageKandidaten;')({});
        const liste = kand('Charizard-Mega-Y');
        assert.ok(liste.includes('mega-charizard'),
            `"mega-charizard" fehlt: ${liste.join(', ')}`);
        assert.ok(liste.includes('mega-charizard-y'),
            `"mega-charizard-y" fehlt: ${liste.join(', ')}`);
        // Und bei einer Mega-Form ohne Zusatz faellt beides zusammen —
        // ohne die Entdopplung stuende der Wert dann zweimal da.
        const einfach = kand('Gallade-Mega');
        assert.strictEqual(einfach.filter(x => x === 'mega-gallade').length, 1);
    });

    it('wo der Nutzungsstand den Schluessel fuehrt, wird er auch genommen', () => {
        /* DIESE ZUSICHERUNG HAT DEN 23.09.2026 NICHT UEBERLEBT — UND DER
           GRUND WAR SIE SELBST.

           Bis dahin stand hier: nimm die sieben Faelle aus FAELLE, und
           fuer jeden, dessen SCHLUESSEL diese Woche in der Datei steht,
           pruefe, dass die Umrechnung ihn findet. Dazu eine Untergrenze
           („mindestens einer"), damit die Zusicherung nicht leerlaeuft.

           Am 23.09.2026, 05:10 UTC hat championsbattledata die
           Schreibweise GEDREHT: `ninetales-alola` statt
           `alolan-ninetales`, `tauros-paldea-aqua` statt
           `paldean-tauros-aqua-breed`, `maushold-four` statt
           `maushold-family-of-four`. Damit stand KEINER der sieben
           Schluessel mehr in der Datei, die Untergrenze schlug an, und
           Deploy 3025/3026/3027 waren rot.

           Sie hatte recht, aber aus dem falschen Grund: sie meldete
           „kaputter Aufbau", wo die Quelle nur anders schrieb. Der
           Fehler war, dass die SCHREIBWEISE der Quelle im Testcode
           auswendig stand.

           JETZT KOMMT DIE ERWARTUNG AUS DER DATEI SELBST. Fuer jeden
           Schluessel mit Bindestrich wird der Anzeigename
           zurueckgebaut — in BEIDEN Schreibweisen, weil der Rueckbau
           sonst wieder eine auswendig gelernte Richtung waere — und
           dann verlangt, dass die Umrechnung genau diesen Schluessel
           wiederfindet. Dreht die Quelle noch einmal, aendert sich hier
           keine Zeile. */
        const usageSlug = new Function('_usage', quelle[0] + '; return usageSlug;')(usage);

        const gross = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);
        const ADJ_ZU_REGION = {
            alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui', paldean: 'Paldea',
        };
        const FORMWORT = { breed: 1, form: 1, forme: 1 };

        /* Aus einem Schluessel den Anzeigenamen bauen, wie Showdown und
           der Kader ihn schreiben. Beide Richtungen der Quelle werden
           bedient — Adjektiv vorn (`alolan-ninetales`) und Form hinten
           (`ninetales-alola`). */
        function anzeigename(key) {
            const w = key.split('-').filter(Boolean);
            if (w[0] === 'mega') {
                const r = w.slice(1).map(gross);
                if (r.length > 1 && (r[r.length - 1] === 'X' || r[r.length - 1] === 'Y')) {
                    return r.slice(0, -1).join('-') + '-Mega-' + r[r.length - 1];
                }
                return r.join('-') + '-Mega';
            }
            if (ADJ_ZU_REGION[w[0]] && w.length >= 2) {
                const r = w.slice(1).filter((x) => !FORMWORT[x]).map(gross);
                return [r[0], ADJ_ZU_REGION[w[0]]].concat(r.slice(1)).join('-');
            }
            return w.filter((x) => !FORMWORT[x]).map(gross).join('-');
        }

        const mitBindestrich = Object.keys(usage).filter((k) => k.indexOf('-') !== -1);
        const daneben = [];
        mitBindestrich.forEach((k) => {
            const name = anzeigename(k);
            const ist = usageSlug(name);
            if (ist !== k) daneben.push(`${k} -> "${name}" -> ${ist}`);
        });
        assert.deepEqual(daneben, [],
            'Diese Schluessel der Nutzungsdatei findet die Umrechnung nicht '
            + `wieder (${mitBindestrich.length} mit Bindestrich geprueft): `
            + daneben.join(' ; '));

        /* Untergrenze GEGEN LEERLAUF, nicht gegen die Woche: bricht die
           Datei zusammen, steht hier nichts mehr zu pruefen und die
           Zusicherung waere lautlos gruen. 39 waren es am 23.09.2026;
           die Grenze liegt bewusst weit darunter, weil Zuwachs und
           Abgang einzelner Formen normal sind. */
        assert.ok(mitBindestrich.length >= 15,
            `nur ${mitBindestrich.length} Schluessel mit Bindestrich in `
            + `data/champions_usage.json (${Object.keys(usage).length} Schluessel) — `
            + 'das ist kein Wochenwert mehr, sondern ein kaputter Aufbau');

        /* UND DIE GEGENRICHTUNG: kein Kadereintrag darf auf die
           Grundform durchfallen. Das ist der teurere Fehler — eine Zahl,
           die echt aussieht, aber einem anderen Pokemon gehoert. Genau
           das passierte am 23.09.2026 mit "Maushold Family of Four"
           (-> `maushold`) und den drei Mega-Z-Eintraegen. */
        const kader = JSON.parse(lies('data/champions_pokedex.json')).entries
            .map((e) => e.en).filter((n) => /[\s(]/.test(String(n)));
        assert.ok(kader.length >= 50,
            `nur ${kader.length} mehrteilige Kadernamen — die Probe waere fast leer`);
        const erbt = [];
        kader.forEach((n) => {
            const s = usageSlug(n);
            if (usage[s] && s.indexOf('-') === -1) erbt.push(`${n} -> ${s}`);
        });
        assert.deepEqual(erbt, [],
            'Diese Formen bekommen die Nutzungszahlen ihrer GRUNDFORM: ' + erbt.join(' ; '));
    });

    it('beide Schreibweisen der Quelle werden erreicht', () => {
        /* DIE WOCHENUNABHAENGIGE FASSUNG DESSELBEN. Die Zusicherung
           darueber haengt an der Datei — steht darin eines Tages nur
           noch eine Schreibweise, kann sie die andere nicht mehr
           pruefen, und die Zeile, die sie erzeugt, koennte ersatzlos
           entfallen. Diese hier haengt an nichts: sie fragt die
           Kandidatenliste, und die kommt allein aus dem Namen.

           Beide Richtungen wurden gebraucht — die erste seit dem
           05.09.2026, die zweite seit dem 23.09.2026, als die Quelle
           drehte. */
        const kand = new Function('_usage', quelle[0] + '; return usageKandidaten;')({});

        // Form HINTEN im Namen -> Adjektiv VORN im Schluessel.
        assert.ok(kand('Ninetales-Alola').includes('alolan-ninetales'),
            'Richtung 1 fehlt: ' + kand('Ninetales-Alola').join(', '));
        assert.ok(kand('Tauros-Paldea-Aqua').includes('paldean-tauros-aqua-breed'),
            'Richtung 1 fehlt bei drei Teilen: ' + kand('Tauros-Paldea-Aqua').join(', '));

        // Adjektiv VORN im Namen -> Form HINTEN im Schluessel.
        assert.ok(kand('Hisuian Goodra').includes('goodra-hisui'),
            'Richtung 2 fehlt: ' + kand('Hisuian Goodra').join(', '));
        assert.ok(kand('Paldean Tauros (Aqua Breed)').includes('tauros-paldea-aqua'),
            'Richtung 2 fehlt bei drei Teilen: '
            + kand('Paldean Tauros (Aqua Breed)').join(', '));
        assert.ok(kand('Maushold Family of Four').includes('maushold-four'),
            'die kurze Schreibweise fehlt: ' + kand('Maushold Family of Four').join(', '));

        /* Und die Grundform bleibt hinten — in BEIDEN Richtungen. Stuende
           sie vorn, bekaeme die Form die Zahlen der Art. */
        [['Ninetales-Alola', 'alolan-ninetales', 'ninetales'],
            ['Hisuian Goodra', 'goodra-hisui', 'goodra']].forEach(([name, form, art]) => {
            const l = kand(name);
            const iForm = l.indexOf(form);
            const iArt = l.indexOf(art);
            assert.ok(iForm >= 0, `${name} bietet ${form} nicht an`);
            if (iArt >= 0) {
                assert.ok(iForm < iArt,
                    `${name} bietet die Grundform (${art}) VOR ${form} an`);
            }
        });

        /* EINE MEGA-FORM BEKOMMT NIE DIE ZAHLEN DER GRUNDFORM. Am
           23.09.2026 trugen "Garchomp (Mega-Z)", "Lucario (Mega-Z)" und
           "Absol (Mega-Z)" die Nutzungszahlen von Garchomp, Lucario und
           Absol. Die Quelle fuehrt derzeit keinen Mega-Schluessel;
           faellt der Kandidat wieder durch, wird geraten. */
        ['Garchomp (Mega-Z)', 'Mega Gallade', 'Charizard-Mega-Y'].forEach((n) => {
            const l = kand(n);
            const art = n.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '').split('-').filter((x) => x !== 'mega')[0];
            assert.ok(l.indexOf(art) === -1,
                `${n} bietet die blosse Art "${art}" an: ${l.join(', ')}`);
        });
    });
});

/* ══════════════════════════════════════════════════════════════════════
   6. WAS BEIM HINSEHEN AUFFIEL
   ══════════════════════════════════════════════════════════════════════ */

describe('Kleinigkeiten, die keine sind', () => {

    it('der PTCGL-Export zählt Karten, nicht Zeilen', () => {
        // Gemessen an einem 60-Karten-Deck: "Pokémon: 12 / Trainer: 14 /
        // Energy: 3 / Total Cards: 60" — 12+14+3 = 29.
        assert.match(FEATURES, /const _summe = \(zeilen\) => zeilen\.reduce/);
        assert.match(FEATURES, /Pokémon: \$\{_summe\(pokemon\)\}/);
        assert.ok(!/Pokémon: \$\{pokemon\.length\}/.test(FEATURES),
            'die Abschnittszahl ist wieder die Zeilenzahl');
    });

    it('die rote Marke zeigt auf allen drei Reitern dasselbe', () => {
        // Gemessen live: 67 Marken mit Summe 138 über einer Kachel, die
        // "66 Karten / 60 Gesamt" sagt. Auf City League sind es 69 mit
        // einem erklärenden Satz darunter.
        assert.match(ANALYSE, /_markeZahl\(finalAvgOverall, finalAvgUsed, finalMaxCount, decksWithCard, totalDecksInArchetype\)/);
        assert.match(ANALYSE, /_markeHinweis\(finalAvgOverall, finalAvgUsed, finalMaxCount, decksWithCard, totalDecksInArchetype\)/);
    });

    it('"keine Major-Daten" wird erst nach einem Ladeversuch behauptet', () => {
        // currentMetaTournamentCardsDataRaw wurde nur beim Filter "play"
        // und nur bei leerem Ergebnis gefüllt. `roh.length === 0` hieß
        // deshalb "es hat noch niemand nachgesehen".
        assert.match(ANALYSE, /if \(!Array\.isArray\(window\.currentMetaTournamentCardsDataRaw\)\) \{/);
        assert.match(ANALYSE, /Major-Rohdaten nicht ladbar/);
        // Ein gescheiterter Ladeversuch ist nicht "kein Major im Format".
        assert.match(ANALYSE, /grund: 'unbekannt',[\s\S]{0,160}majorLeerUnbekannt/);
    });

    it('der Schließknopf fällt nicht mehr in den Textfluss', () => {
        // Gemessen: Titel x 753-938 / y 93-119 gegen Knopf x 809-849 /
        // y 65-105 — Überschneidung 40 x 12 px, dazu das Wort
        // "Schließen" quer auf der Grundlinie.
        const abschnitt = SCHLIESS.slice(SCHLIESS.indexOf('DAS LABEL BRAUCHT EINEN ANKER'));
        assert.ok(abschnitt.length > 0, 'der Block ist verschwunden');
        for (const k of ['.help-modal-close', '.draw-sim-close-btn', '.auth-modal-close', '.fullscreen-close']) {
            const nachRelativ = abschnitt.slice(abschnitt.indexOf('Nur diese sind'));
            assert.ok(!nachRelativ.includes(k),
                `${k} bekommt wieder position: relative — es ist in seiner Bauteil-CSS absolut positioniert`);
        }
    });

    it('die Champions-Kopfzeile bricht am Telefon um', () => {
        // Gemessen bei 390 px: Konsole clientWidth 364, scrollWidth 473;
        // von "Einzel" waren 0 px sichtbar, und overflow:hidden lässt
        // auch kein Wischen zu.
        assert.match(SIDEQUEST, /@media \(max-width: 720px\) \{[\s\S]{0,400}\.sq-console \.sq-top \{[\s\S]{0,120}flex-wrap: wrap;/);
        assert.match(SIDEQUEST, /\.sq-console \.sq-seg button \{ min-height: 44px;/);
    });

    it('die Autovervollständigung gewinnt gegen die CLS-Regel', () => {
        // Gemessen: das Vorschlagsbild rendert mit 1517 x 2124 px, weil
        // img[src*="limitlesstcg"] { width:100% } dieselbe Spezifität hat
        // und später geladen wird.
        assert.match(STYLES, /\.cards-autocomplete-item img \{[\s\S]{0,120}width: 50px !important;/);
        assert.match(STYLES, /aspect-ratio: auto !important;/);
    });

    it('die Autovervollständigung ist nicht mehr fest weiß', () => {
        assert.match(STYLES, /background: var\(--surface-1, white\);/);
    });
});
