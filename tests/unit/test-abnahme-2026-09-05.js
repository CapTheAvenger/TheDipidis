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
        assert.match(METACALL, /_matchupMap\[dk\]\[ok\] = \{ pWin, pTie, pLoss, partien \};/);
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
        assert.match(METACALL, /function _wrChip\(wert, partien\)/);
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

    it('"dort im Schnitt" liest das Feld für "dort"', () => {
        // avgCount ist totalCopies / alle Listen — daraus wurde
        // "dort im Schnitt 0,12 Kopien". Eine Karte, die in einer Liste
        // IST, ist dort mindestens einmal drin.
        assert.match(METACARDS, /var dort = Number\(card && card\.avgCountWhenUsed\) \|\| 0;/);
        assert.match(METACARDS, /dort im Schnitt '\s*\+ _kommaZahl\(dort, 2\)/);
        assert.match(METACARDS, /Über alle Listen gerechnet/);
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
        assert.match(NUTZUNG, /barPanel\(L\(\)\.moves, block\.move, moveRow, 400\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.nature, block\.nature, natRow, 100\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.item, block\.held_item, moveRow, 100\)/);
        assert.match(NUTZUNG, /barPanel\(L\(\)\.ability, block\.ability, moveRow, 100\)/);
    });

    it('beide Sprachen haben die Sätze', () => {
        for (const k of ['summeUeber', 'summeUnter']) {
            const n = NUTZUNG.split(k + ':').length - 1;
            assert.equal(n, 2, `${k} steht ${n}-mal statt zweimal (DE und EN)`);
        }
    });
});

describe('Champions-Nutzung: Regionalformen finden ihre Daten', () => {

    // Diese Zusicherung rechnet gegen data/champions_usage.json. Sie prüft
    // eine EIGENSCHAFT der Namensumrechnung, keinen Wochenwert: für einen
    // Namen aus der Rangliste muss ein Schlüssel herauskommen, den die Datei
    // wirklich führt. Welche Pokémon diese Woche dort stehen, ist ihr egal.
    const usage = JSON.parse(lies('data/champions_usage.json')).pokemon;
    const quelle = NUTZUNG.match(/var USAGE_REGION[\s\S]*?\n {4}function usageSlug\(name\) \{[\s\S]*?\n {4}\}/);

    it('der Rechenweg ist auffindbar', () => {
        assert.ok(quelle, 'usageSlug/usageKandidaten sind nicht mehr als Block lesbar');
    });

    it('Regional-, Mega- und Formnamen lösen auf', () => {
        // Gemessen am 05.09.2026: 17 von 86 Zeilen der Rangliste fanden
        // ihre Daten nicht — alle Regionalformen und alle Mega-Formen.
        const usageSlug = new Function('_usage', quelle[0] + '; return usageSlug;')(usage);
        const faelle = [
            ['Ninetales-Alola',  'alolan-ninetales'],
            ['Decidueye-Hisui',  'hisuian-decidueye'],
            ['Zoroark-Hisui',    'hisuian-zoroark'],
            ['Slowbro-Galar',    'galarian-slowbro'],
            ['Lycanroc-Dusk',    'lycanroc-dusk-form'],
            ['Maushold-Four',    'maushold-family-of-four'],
            ['Gallade-Mega',     'mega-gallade'],
        ];
        for (const [name, erwartet] of faelle) {
            const s = usageSlug(name);
            assert.equal(s, erwartet, `${name} löst auf ${s} auf statt auf ${erwartet}`);
            assert.ok(usage[s], `${s} steht nicht in champions_usage.json`);
        }
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
