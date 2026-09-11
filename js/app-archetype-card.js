// app-archetype-card.js — the per-archetype detail card.
//
// One deck, three headline numbers, and every matchup it has played,
// sorted by win rate. This is the view the whole Deck-Report effort was
// actually about; the Global-EN panel (app-tier-meta.js) answers "how
// does the field rank", this answers "how do I play this deck".
//
// Data comes from files the app already loads:
//   data/limitless_online_decks.csv          share, win rate, count
//   data/online_tournament_top8_decks.csv    conversion (via app-utils)
//   window._matchupRegistry                  built by app-meta-cards.js
//
// The conversion figure is NOT recomputed here. computeConversionPerformance
// lives in app-utils.js precisely so this card and the panel cannot show
// two different numbers for one deck.
//
// Global-EN only. These are online tournament files; the JP City League
// space has its own data and must never be mixed with them.
(function () {
    'use strict';

    const DECKS_URL = 'limitless_online_decks.csv';
    const TOP8_URL = 'online_tournament_top8_decks.csv';
    // Die Praesenzseite. Der Dateiname traegt den Meta-Schluessel, welche
    // es gibt sagt das Verzeichnis (siehe _majorLaden).
    const MAJOR_VERZ_URL = 'labs_tournament_decks_verzeichnis.json';

    /* WARUM DIE KACHELN SEIT DEM 01.09.2026 ZWEI ZAHLEN TRAGEN
       ------------------------------------------------------
       Auftrag des Betreibers: "In der tierlist bei global sollte wir
       Share: online x Major y ttl z % und das gleiche fuer winrate und
       top 8 / day 2 Quote. So sieht man schnell den Unterschied zwischen
       online und Major Ergebnissen."

       Und es IST ein Unterschied, gemessen am 01.09. gegen Worlds San
       Francisco (774 Spieler, 44 Archetypen):

           Deck                  Anteil online   Anteil Major
           Dragapult                    7,3 %        22,2 %
           Dragapult Dusknoir           5,5 %        10,5 %
           Dragapult Blaziken           5,8 %         9,8 %
           Mega Excadrill               7,5 %         4,1 %
           Grimmsnarl Froslass          4,3 %         0,9 %
           Dhelmise                     4,0 %         1,0 %

       Dragapult verdreifacht seinen Anteil, Dhelmise faellt auf ein
       Viertel. Wer nur die Online-Spalte sah, hat das Turnierfeld nicht
       gesehen.

       DREI ENTSCHEIDUNGEN, DIE HIER FESTHAENGEN

       1. Keine dritte "gesamt"-Zahl. Ehrlich gepoolt wiegt das eine
          Major 2-3 % — der Mischwert laege praktisch auf dem
          Online-Wert und wuerde genau den Unterschied verstecken, um
          den es geht. Zwei beschriftete Zahlen sagen mehr als drei,
          von denen eine nichts traegt.

       2. Beide Win Rates sind Siege / ALLE Partien. Entscheidung des
          Betreibers: "online wird die winrate ganz normal gewonnene
          kaempfe durch gesamtanzahl kaempfe genommen, was ja auch
          richtig ist weil nur so viele Kaempfe gewonnen wurden."
          Die Labs-Datei fuehrt daneben `win_pct` als MATCHPUNKTE
          ((3S+U)/3n) — die wird hier bewusst NICHT gelesen, sondern aus
          wins/losses/ties neu gerechnet. Sonst staende links eine
          Win Rate und rechts eine Punktequote, und der Leser
          vergliche zwei Skalen.

          ABER: am Major enden 10,98 % der Partien unentschieden, online
          nur 1,26 %. Auf derselben Skala kostet das die Major-Spalte
          rund fuenf Punkte, ohne dass ein Deck schlechter gespielt
          haette. Deshalb steht die Remisquote im Hinweis an der Kachel —
          ohne sie liest sich "54,1 online gegen 42,4 Major" als
          Leistungseinbruch, und das waere falsch.

       3. Top-8 und Day 2 sind KEIN Paar. Ein Major vergibt acht
          Cut-Plaetze: 22 von 27 Decks stehen dort auf null, eine
          Major-Top-8-Quote waere fast ueberall 0,0 %. Umgekehrt gibt es
          Day 2 online gar nicht. Also traegt die dritte Kachel die
          Online-Top-8-Quote weiter und die vierte die Day-2-Quote vom
          Major — jede mit ihrer Herkunft in der Beschriftung, keine mit
          einer leeren Gegenspalte. So hat es der Betreiber auch
          entschieden. */

    // A matchup on fewer games than this says very little — 8 wins in 12
    // games reads as 66 % and means almost nothing. Same threshold and
    // the same treatment as the heatmap's `heatmap-td-n-low`.
    const THIN_GAMES = 20;

    /* Ab wann eine Major-Win-Rate als duenn MARKIERT wird — nicht, ab
       wann sie gezeigt wird. Sie wird immer gezeigt, sobald es Partien
       gibt.
       ------------------------------------------------------------------
       Hier stand bis zum 02.09.2026 `MIN_MAJOR_PARTIEN = 40`, und
       darunter blieb die Kachel leer. Der Betreiber hat es gemeldet:
       "es gibt Major Daten warum werden sie nicht genutzt?" — Lucario
       Hariyama 14-15-2, Rocket's Mewtwo 8-8-2, beide standen auf
       "zu wenige".

       Nachgemessen war die Schwelle nicht nur zu hoch, sondern
       willkuerlich. Sie verbarg 27 von 44 Decks, und sie trennte nichts:

           Grimmsnarl Froslass   45 Partien · 24,4 % · KI ±15 pp  ANGEZEIGT
           Alakazam Dusknoir     39 Partien · 66,7 % · KI ±16 pp  verborgen

       Praktisch dieselbe Unsicherheit, gegenteilige Behandlung. Die
       Partienzahl ist ein Kontinuum von 16 bis 1.277; ein Schnitt
       mittendrin macht aus "unsicher" faelschlich "nicht vorhanden".
       Und schlimmer: die Begruendung, die hier stand, trug nicht — sie
       nannte Grimmsnarl als Beispiel fuer das, was die Schwelle
       verhindere, und Grimmsnarl lag mit 45 Partien darueber.

       Richtig ist, die Zahl zu zeigen UND zu sagen, wie sicher sie ist.
       Deshalb steht die Partienzahl jetzt auf der Kachel und das
       Vertrauensintervall im Hinweis. 100 Partien ist die Grenze, ab der
       das 95-%-Intervall enger als ±10 Punkte wird — darunter wird die
       Zahl gedaempft dargestellt, aber sie steht da. */
    const MAJOR_DUENN_PARTIEN = 100;

    /* Unter so vielen Antritten wird keine Day-2-Quote gezeigt.
     *
     * "2 von 3" sind 66,7 % und sagen nichts. Im aktuellen Format
     * (TEF-PBL, Worlds San Francisco, 774 Spieler) haben 26 von 44 Decks
     * zwischen 1 und 4 Antritte — bei 59 % der Decks waere die Quote
     * also reines Rauschen.
     *
     * Die Zahl stand bis zum 02.09.2026 nur als nacktes `>= 5` in der
     * Kachel — und das GETEILTE BILD kannte sie gar nicht. Es druckte
     * "Day 2 (Major) 66,7 %", wo die Seite daneben "zu wenige Antritte"
     * sagte: das Bild widersprach der Seite, von der es stammt, bei 26
     * von 44 Decks. Jetzt teilen sich beide diese eine Konstante. */
    const DAY2_MIN_ANTRITTE = 5;

    /* MINDESTSTICHPROBE FUER EINE PRAESENZ-PAARUNG (07.09.2026).
     *
     * Gilt NUR fuer die Spalte "Major-WR" der Matchup-Tabelle, also fuer
     * eine einzelne Paarung — nicht fuer die Deck-Kachel daneben. Deren
     * Schwelle ist MAJOR_DUENN_PARTIEN und bleibt, was sie ist.
     *
     * DER BEFUND. Im laufenden Format TEF-PBL gibt es genau EIN
     * Praesenzturnier. In data/labs_tournament_matchups_TEF-PBL.csv
     * (day_filter = overall) fuehrt Mega Excadrill 27 Gegner. Davon
     * erreicht GENAU EINER 30 Partien: Dragapult mit 52. Daneben stand
     * "vs Crustle 88,89 %" auf 9 Partien (Bilanz 8-1-0) und "vs
     * Grimmsnarl Froslass 100 %" auf 2.
     *
     * WARUM 30. Die Schwelle ist kein Geschmack, sondern eine Ablesung:
     * bei n Partien verschiebt EINE einzelne Partie die Quote um
     * 100/n Punkte. Bei 30 sind das 3,3 Punkte — die erste
     * Nachkommastelle, die die Zelle anzeigt, steht dann noch fuer
     * etwas. Bei 9 Partien sind es 11,1 Punkte je Partie, bei 2 ganze
     * 50: dort beschreibt die Prozentangabe nicht das Matchup, sondern
     * den Zufall eines Nachmittags.
     *
     * WAS STATTDESSEN DASTEHT. Nicht "zu wenige" und kein leeres Feld —
     * genau das hat der Betreiber am 02.09.2026 zu Recht bemaengelt
     * ("es gibt Major Daten warum werden sie nicht genutzt?"). Sondern
     * die ROHBILANZ und die Fallzahl: "8-1-0 aus 9". Das ist MEHR
     * Information als die Quote, nicht weniger, und es laesst sich nicht
     * mit einer belastbaren Quote verwechseln.
     *
     * Die Schwelle steht im Text unter der Tabelle, damit niemand raten
     * muss, ab wann eine Zahl erscheint. */
    const MIN_PRAESENZ_PARTIEN = 30;

    /* Wie viele Paarungen die zugeklappte Karte in der Tier-Liste zeigt.
     *
     * Waren acht, sind zwoelf (11.09.2026). Platz dafuer ist da: der
     * Zeitraumsatz (drei Zeilen) und die Kuerzel-Legende (zwei bis drei)
     * stehen jetzt hinter dem Info-Knopf des Abschnitts. Gemeldet:
     * „vielleicht koennen wir den freigewordenen Platz irgendwie ja
     * dafuer nutzen". Eine Zeile misst 34 px, die beiden Absaetze
     * zusammen rund 130 — das sind knapp vier Zeilen, und zwoelf statt
     * acht kostet vier. */
    const MU_VORSCHAU = 12;

    /* ── WELCHE PAARUNGEN DIE VORSCHAU ZEIGT ─────────────────────────
     *
     * Bis zum 11.09.2026: `all.slice(0, 8)` — die acht mit der hoechsten
     * Quote. Zwei Dinge waren daran falsch.
     *
     * ERSTENS fehlten die schlechten Paarungen vollstaendig. Wer sich
     * auf ein Turnier vorbereitet, will genau die sehen; die guten
     * braucht er nicht zu ueben.
     *
     * ZWEITENS entschied allein die Quote, wer drankommt. Gemeldet:
     * „ich seh ja jetzt hier zum Beispiel gegen Mega Greninja 197
     * Matches, eine 63-prozentige Winrate. Vielleicht sollten wir denn,
     * wenn wir hier schon nur sag mal zehn Matches hinschreiben koennen,
     * die fuenf positive und fuenf negative, dann sollten wir auf jeden
     * Fall von den fuenf Positiven die auch hinschreiben mit den meisten
     * Begegnungen … weil ich glaube, da gibt's bestimmt noch andere
     * Decks, wo man auch eine positive Winrate hat, aber mehr als 200
     * Matches hatte."
     *
     * Das Argument traegt: eine 68-%-Paarung, die man zweimal trifft,
     * zaehlt fuer die Vorbereitung weniger als eine 61-%-Paarung, die
     * staendig kommt. Also wird JE SEITE nach Begegnungszahl ausgewaehlt
     * und die Auswahl danach wieder nach Quote sortiert — man liest sie
     * weiterhin von gut nach schlecht, aber es stehen die drin, die man
     * wirklich trifft.
     *
     * Die Haelften sind bewusst gleich gross: sonst entschiede die Zahl
     * der guten Paarungen eines Decks darueber, wie viele schlechte man
     * zu sehen bekommt. Reicht eine Seite nicht, fuellt die andere auf —
     * ein Deck mit nur drei schlechten Paarungen verschenkt sonst
     * Zeilen.
     */
    function vorschauAuswahl(alle, wieViele) {
        if (!Array.isArray(alle) || alle.length <= wieViele) return alle || [];
        const n = (m) => (Number.isFinite(m.games) ? m.games : 0);
        const gut = alle.filter(m => m.winRate >= 50).slice().sort((a, b) => n(b) - n(a));
        const schlecht = alle.filter(m => m.winRate < 50).slice().sort((a, b) => n(b) - n(a));
        const haelfte = Math.floor(wieViele / 2);
        let ausGut = gut.slice(0, haelfte);
        let ausSchlecht = schlecht.slice(0, wieViele - haelfte);
        // Auffuellen, wenn eine Seite zu duenn ist.
        if (ausGut.length + ausSchlecht.length < wieViele) {
            const fehlt = wieViele - ausGut.length - ausSchlecht.length;
            if (gut.length > ausGut.length) ausGut = gut.slice(0, ausGut.length + fehlt);
            else ausSchlecht = schlecht.slice(0, ausSchlecht.length + fehlt);
        }
        return ausGut.concat(ausSchlecht).sort((a, b) => b.winRate - a.winRate);
    }

    let _decks = null;          // deck_name -> { share, winRate, count }
    let _conv = null;           // computeConversionPerformance() result
    /* Stehen hinter _conv gezaehlte oder gewichtete Antritte? Der
       Hinweistext an der Kachel nennt die Sorte beim Namen. */
    let _convGezaehlt = false;
    let _major = null;          // deck_name -> { share, winRate, ... } | {} wenn kein Major
    let _majorMu = null;        // deck_name -> { gegner -> { anzahl, punkte } }
    /* Welchen Zeitraum decken die Major-Zahlen ab? Aus den geladenen
       Zeilen selbst gelesen (Spalte tournament_date), nicht geschaetzt.
       { key, von, bis, turniere } oder null, wenn kein Auszug da ist. */
    let _majorZeitraum = null;
    let _loading = null;
    let _openDeck = null;       // name of the deck currently shown

    function L(key, fallback) {
        if (typeof t === 'function') {
            const v = t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    function isDe() {
        return typeof getLang === 'function' && getLang() === 'de';
    }

    /* ── DER NAME EINER QUOTE WIRD GEHOLT, NICHT GESCHRIEBEN (08.09.2026)
     *
     * ANORDNUNG DES BETREIBERS: „Win-Raten ueberall in der
     * Limitless-Bezeichnung ‚Win %‘ — keine eigenen Begriffe."
     * Sie ist KEINE pauschale Umbenennung. js/win-rate-konvention.js
     * haelt „Win %" der Konvention MATCHPUNKTE (3S+U)/(3·Partien) vor;
     * so nennt Limitless genau diese Spalte. Eine Zahl, die S/(S+N+U)
     * oder S/(S+N) rechnet, „Win %" zu nennen, waere derselbe Fehler in
     * die andere Richtung — und der teurere, weil er der Quelle einen
     * Namen unterschiebt, den sie fuer etwas anderes benutzt.
     *
     * DIESE KARTE ZEIGT ZWEI VERSCHIEDENE KONVENTIONEN, KEINE DAVON
     * MATCHPUNKTE (nachgerechnet am 08.09.2026 an den Dateien selbst):
     *
     *   Kachel „Quote"  MIT_UNENTSCHIEDEN  S/(S+N+U)
     *       links  win_rate_numeric aus data/limitless_online_decks.csv
     *              (135 von 136 Zeilen auf 0,01 Punkte genau)
     *       rechts hier neu gerechnet aus wins/losses/ties der
     *              Labs-Datei (_majorLaden: „Siege durch ALLE Partien")
     *
     *   Spalten „WR" / „Major-WR"  OHNE_UNENTSCHIEDEN  S/(S+N)
     *       links  win_rate aus data/limitless_online_decks_matchups.csv
     *              (1.716 von 1.716 Zeilen auf 0,005 Punkte genau)
     *       rechts hier aus vs_wins/vs_losses gerechnet — NICHT die
     *              Spalte vs_win_pct der Labs-Datei, die ist
     *              Matchpunkte (811 von 811 Zeilen auf 0,005 genau).
     *
     * Der Name wird deshalb zur Laufzeit aus dem Modul geholt. Faellt
     * das Modul aus, steht die FORMEL da: die ist kein vierter Name und
     * nie falsch. Und in dieser Datei darf ohnehin kein deutsches Wort
     * fuer die Quote stehen (tests/unit/test-sprache-win-rate.js). */
    function quotenName(id) {
        const K = (typeof window !== 'undefined') ? window.WinRateKonvention : null;
        const kurz = K && typeof K.kurz === 'function' ? K.kurz(id) : '';
        if (kurz) return kurz;
        return quotenFormel(id) || String(id);
    }

    function quotenFormel(id) {
        const K = (typeof window !== 'undefined') ? window.WinRateKonvention : null;
        const k = K && typeof K.hol === 'function' ? K.hol(id) : null;
        return k ? k.formel : '';
    }

    /** {quote} und {formel} in einem Uebersetzungswert fuellen. */
    function mitQuote(text, id) {
        return String(text == null ? '' : text)
            .replace(/\{quote\}/g, quotenName(id))
            .replace(/\{formel\}/g, quotenFormel(id));
    }

    /**
     * Der Hinweis, der eine KURZFORM zulaessig macht.
     *
     * „WR" und „Major-WR" sind Hausnamen, solange nichts sie aufloest.
     * Mit diesem Text am Spaltenkopf tragen sie den vollen Namen und
     * die Formel — dann sind sie eine Abkuerzung und keine zweite
     * Bezeichnung. Ohne ihn duerfen sie nicht dastehen.
     */
    function quotenHinweis(id) {
        const K = (typeof window !== 'undefined') ? window.WinRateKonvention : null;
        const lang = (K && typeof K.hinweis === 'function') ? K.hinweis(id) : '';
        const name = quotenName(id);
        return lang ? (name + ' — ' + lang) : (name + ' ' + quotenFormel(id));
    }

    function num(v) {
        return (typeof window.parseLocaleNumber === 'function')
            ? window.parseLocaleNumber(v || '0', 0) : 0;
    }

    function fmt(n, digits = 1) {
        const s = Number(n).toFixed(digits);
        return isDe() ? s.replace('.', ',') : s;
    }

    /** Ganze Zahl mit Tausendertrennung. "10243 Partien" liest sich schlecht. */
    function fmtGanz(n) {
        const z = Math.round(Number(n) || 0);
        return isDe() ? z.toLocaleString('de-DE') : z.toLocaleString('en-US');
    }

    /* BEFUND (Schlussabnahme 30.08.2026): die Kachel schrieb
       "72 von 708 Antritten … 10,10 % Cut-Quote". In der Datei stehen
       71,5 von 708 — Antritte sind turniergewichtet. fmtGanz() rundete
       die halbe Zahl weg, die Quote kam aus dem ungerundeten Wert, und
       72/708 sind 10,17 %. Die Startseite zeigte fuer denselben Wert
       schon "71,5 von 708" (js/meta-analysis-hub.js, dort am
       29.08. behoben) — zwei Ansichten, dieselbe Zahl, zwei
       Schreibweisen, und nur eine passte zu ihrer eigenen Prozentangabe.
       Dieselbe Regel wie dort: eine Nachkommastelle, wo der Wert keine
       ganze Zahl ist. */
    function fmtGewichtet(n) {
        const z = Number(n) || 0;
        const loc = isDe() ? 'de-DE' : 'en-US';
        return Number.isInteger(z)
            ? z.toLocaleString(loc)
            : z.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── data ────────────────────────────────────────────────────────

    /* Das Trennzeichen ist ein Argument, kein Naturgesetz.
     *
     * Die eigenen Exporte trennen an ';', die Labs-Auszuege an ','. Bis
     * zum 01.09.2026 hiess diese Funktion parseSemicolonCsv und konnte nur
     * das eine — an anderer Stelle wurde damit eine Komma-Datei geparst,
     * was 44 Zeilen mit je EINEM Feld ergab und stillschweigend als
     * "keine Daten" durchging (PR #602). Deshalb steht es jetzt hier
     * oben, sichtbar, mit ';' als Vorgabe fuer die Bestandsaufrufe. */
    function parseCsv(text, sep) {
        const trenn = sep || ';';
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
        if (!lines.length) return [];
        const head = teile(lines[0], trenn).map(h => h.trim());
        return lines.slice(1).map(line => {
            const cells = teile(line, trenn);
            const row = {};
            head.forEach((h, i) => { row[h] = cells[i]; });
            return row;
        });
    }

    /* Anfuehrungszeichen zaehlen. Ein blosses split() reicht nicht.
     *
     * BEFUND 01.09.2026, beim Bau der Major-Spalte: die Labs-Auszuege
     * fuehren eine Spalte `pokemon` mit Listen darin —
     *
     *     …,Dragapult Dusknoir,dragapult-dusknoir,"dragapult, dusknoir",81,…
     *
     * 28 der 44 Zeilen tragen so ein Feld. Mit `split(',')` zerfaellt es
     * in zwei, und ab dort ist JEDE folgende Spalte um eins verschoben:
     * `player_count` las 'dusknoir"', `day1_players` las 0, und die
     * Day-2-Quote des Feldes kam auf 404,5 % heraus. Genau daran ist es
     * aufgefallen — eine Quote ueber 100 faellt auf. Die 27 Decks
     * darunter waeren still falsch gewesen.
     *
     * Die Vorgaengerfunktion parseSemicolonCsv hat genauso geteilt; fuer
     * die eigenen Semikolon-Exporte ging das gut, weil dort keine
     * Anfuehrungszeichen stehen. Jetzt zaehlt der Teiler sie, und beide
     * Trennzeichen laufen ueber denselben Weg. */
    function teile(zeile, trenn) {
        const raus = [];
        let feld = '';
        let inAnf = false;
        for (let i = 0; i < zeile.length; i++) {
            const c = zeile[i];
            if (c === '"') {
                // Zwei Anfuehrungszeichen hintereinander sind eines im Text.
                if (inAnf && zeile[i + 1] === '"') { feld += '"'; i++; continue; }
                inAnf = !inAnf;
                continue;
            }
            if (c === trenn && !inAnf) { raus.push(feld); feld = ''; continue; }
            feld += c;
        }
        raus.push(feld);
        return raus;
    }

    // Bestandsname, damit die Aufrufer und die Tests nicht alle mitwandern.
    function parseSemicolonCsv(text) { return parseCsv(text, ';'); }

    /* Der Auszug des laufenden Formats, wenn es einen gibt.
     *
     * Erst das Verzeichnis fragen, dann die Datei holen — das ist derselbe
     * Weg wie in js/app-tier-meta.js (labsAuszugVorhanden). Ein HEAD auf
     * einen Auszug, den es noch nicht gibt, hinterliesse sonst bei jedem
     * Seitenaufruf eine 404 in der Konsole; fuer ein frisches Format ist
     * "noch kein Praesenzturnier" der Normalfall, kein Fehler.
     *
     * KOMMA, nicht Semikolon. Die Labs-Dateien kommen aus einer anderen
     * Quelle als die eigenen Exporte. Mit dem hauseigenen ';' geparst wird
     * die Datei zu Zeilen mit EINEM Feld, `deck_name` ist undefined, und
     * alles faellt still auf "kein Major" zurueck — genau der Fehler, der
     * die Tier-Liste am 01.09. Worlds nicht sehen liess (PR #602). */
    function _majorLaden(base, stamp) {
        const fw = (typeof window !== 'undefined') ? window._formatWindow : null;
        const alt = fw && fw.oldest_legal_set ? String(fw.oldest_legal_set).toUpperCase() : '';
        const neu = fw && fw.current_set ? String(fw.current_set).toUpperCase() : '';
        if (!alt || !neu) return Promise.resolve({});
        const key = `${alt}-${neu}`;
        return fetch(base + MAJOR_VERZ_URL + stamp)
            .then(r => r.ok ? r.json() : null)
            .then(v => {
                const kennt = v && Array.isArray(v.meta_keys) && v.meta_keys.indexOf(key) !== -1;
                if (!kennt) return '';
                _majorZeitraum = { key: key, von: null, bis: null, turniere: 0 };
                return fetch(`${base}labs_tournament_decks_${key}.csv${stamp}`)
                    .then(r => r.ok ? r.text() : '');
            })
            .then(txt => {
                const raus = {};
                if (!txt) return raus;
                /* Der Zeitraum der Praesenzzahlen kommt aus den Zeilen,
                   die tatsaechlich geladen wurden — sonst stuende an der
                   Kachel ein Datum, das niemand nachzaehlen kann. */
                const _turniere = new Set();
                for (const r of parseCsv(txt, ',')) {
                    const name = String(r.deck_name || '').trim();
                    if (!name) continue;
                    const tag = String(r.tournament_date || '').trim();
                    if (_majorZeitraum && /^\d{4}-\d{2}-\d{2}$/.test(tag)) {
                        if (!_majorZeitraum.von || tag < _majorZeitraum.von) _majorZeitraum.von = tag;
                        if (!_majorZeitraum.bis || tag > _majorZeitraum.bis) _majorZeitraum.bis = tag;
                    }
                    const tid = String(r.tournament_id || r.tournament_name || '').trim();
                    if (tid) _turniere.add(tid);
                    const s = num(r.wins), n_ = num(r.losses), u = num(r.ties);
                    const partien = s + n_ + u;
                    const d1 = num(r.day1_players);
                    const d2 = num(r.day2_players);
                    const e = raus[name] || (raus[name] = {
                        antritte: 0, share: 0, siege: 0, partien: 0,
                        unentschieden: 0, day1: 0, day2: 0, turniere: 0,
                    });
                    e.antritte += num(r.player_count);
                    e.share += num(r.share_pct);
                    e.siege += s;
                    e.partien += partien;
                    e.unentschieden += u;
                    e.day1 += d1;
                    e.day2 += d2;
                    e.turniere += 1;
                }
                if (_majorZeitraum) _majorZeitraum.turniere = _turniere.size;
                for (const k of Object.keys(raus)) {
                    const e = raus[k];
                    // Siege durch ALLE Partien — dieselbe Rechnung wie online.
                    // NICHT die Spalte `win_pct` der Datei: die fuehrt
                    // Matchpunkte (3S+U)/3n und ist eine andere Skala.
                    e.winRate = e.partien > 0 ? (e.siege / e.partien) * 100 : null;
                    e.remisQuote = e.partien > 0 ? (e.unentschieden / e.partien) * 100 : null;
                    e.day2Quote = e.day1 > 0 ? (e.day2 / e.day1) * 100 : null;
                }
                return raus;
            })
            .catch(() => ({}));
    }

    function load() {
        if (_decks && _conv && _major && _majorMu) return Promise.resolve(true);
        if (_loading) return _loading;
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : 'data/';
        const stamp = `?t=${Date.now()}`;
        _loading = Promise.all([
            fetch(base + DECKS_URL + stamp).then(r => r.ok ? r.text() : ''),
            fetch(base + TOP8_URL + stamp).then(r => r.ok ? r.text() : ''),
            _majorLaden(base, stamp),
            /* Die Praesenz-Matchups kommen aus js/app-current-meta.js —
               dieselbe Datei zweimal zu parsen hiesse, zwei Zahlen fuer
               eine Sache zu fuehren. Fehlt der Verweis (andere Seite,
               anderer Ladeweg), bleibt die Spalte leer statt kaputt. */
            (typeof window.ladeMajorMatchups === 'function')
                ? window.ladeMajorMatchups().catch(() => ({}))
                : Promise.resolve({}),
        ]).then(([decksTxt, top8Txt, major, majorMu]) => {
            _major = major || {};
            _majorMu = majorMu || {};
            _decks = {};
            for (const r of parseSemicolonCsv(decksTxt)) {
                if (!r.deck_name) continue;
                _decks[r.deck_name.trim()] = {
                    share: num(r.share_numeric),
                    winRate: num(r.win_rate_numeric),
                    count: num(r.count),
                    // Partien = Siege + Niederlagen + Unentschieden. Sie sagen,
                    // wie belastbar die Win Rate ist: 80 der 132 Decks liegen
                    // unter 300 Partien, dort wackelt die Zahl sichtbar.
                    partien: num(r.wins) + num(r.losses) + num(r.ties),
                };
            }
            const rows = parseSemicolonCsv(top8Txt);
            /* BEFUND DER ABNAHME (02.09.2026): diese Karte war die
               VIERTE Ansicht derselben Quote — und die einzige, die
               noch die gewichtete Spalte zeigte. Fuer Dragapult stand
               hier 10,5 %, waehrend Startseite, Meta-Performance und
               die Intel-Kachel des Meta Calls 10,2 % sagten. Ueber die
               121 Zeilen der Datei wichen 53 Decks ab.
               Dasselbe Tor wie ueberall sonst, aus app-utils.js. */
            const tor = (rows.length && typeof window.gezaehlteZeilen === 'function')
                ? window.gezaehlteZeilen(rows)
                : { zeilen: rows, hatRoh: false };
            _convGezaehlt = tor.hatRoh;
            _conv = (rows.length && typeof window.computeConversionPerformance === 'function')
                ? window.computeConversionPerformance(tor.zeilen) : null;
            return true;
        }).catch(() => { _decks = _decks || {}; _conv = null; _major = _major || {}; _majorMu = _majorMu || {}; return false; });
        return _loading;
    }

    // Case-insensitive lookup: the tier list lower-cases its deck names.
    function findKey(map, name) {
        if (!map || !name) return null;
        if (map[name]) return name;
        const want = String(name).toLowerCase();
        return Object.keys(map).find(k => k.toLowerCase() === want) || null;
    }

    function matchupsFor(name) {
        const reg = window._matchupRegistry || {};
        const key = findKey(reg, name);
        if (!key) return [];
        return Object.values(reg[key] || {}).map(m => {
            // record is "61 - 28 - 0" — wins, losses, ties.
            const parts = String(m.record || '').split('-').map(x => parseInt(x.trim(), 10));
            const games = parseInt(m.total_games, 10) || 0;
            // Angezeigt wird die geglaettete Quote (js/matchup-glaettung.js),
            // nicht der Rohwert: der Median unserer Paarungen hat 16 Partien,
            // 55 % liegen unter 20. Roh stand hier "100 %" auf einem 3-0.
            // winRateRoh bleibt fuer den Tooltip erhalten.
            const G = (typeof window !== 'undefined') ? window.DsGlaettung : null;
            const roh = Number(m.win_rate_numeric) || 0;
            const geglaettet = Number.isFinite(Number(m.win_rate_shrunk))
                ? Number(m.win_rate_shrunk)
                : (G ? G.ausEintrag(m) : roh);
            return {
                opponent: m.opponent_deck,
                winRate: geglaettet,
                winRateRoh: roh,
                wins: Number.isFinite(parts[0]) ? parts[0] : null,
                losses: Number.isFinite(parts[1]) ? parts[1] : null,
                // Die Unentschieden lagen im Register und wurden nirgends
                // ausgegeben. In 423 von 1.546 Zeilen ist W + L kleiner als
                // die Partienzahl daneben, und die Differenz ist jedes Mal
                // genau diese Zahl — drei Werte in einer Zeile, die sich
                // nicht addieren. Sie stehen jetzt in der Tabelle.
                ties: Number.isFinite(parts[2]) ? parts[2] : null,
                games,
                thin: games < THIN_GAMES,
                /* DIE PRAESENZSEITE JE PAARUNG (02.09.2026).
                   Gemeldet: "ausgeklappt auf VS Deck Ebene sehe ich nicht
                   das Online und Major jeweils angezeigt wird."

                   SEIT DEM 03.09.2026 DIESELBE RECHNUNG WIE LINKS.
                   Vorher stand hier die Spalte vs_win_pct der Labs-Datei.
                   Die heisst dort "Win %", ist aber die Matchpunktquote
                   (3S+U)/(3M) — nachgerechnet an drei Paarungen des
                   Worlds-Laufs, die sie auf 0,01 Punkte genau treffen,
                   waehrend S/(S+N) um 1,5 bis 12 Punkte danebenliegt.
                   Zwei Spalten, zwei Rechnungen: deshalb hiess diese
                   "Major-P" statt "Major-WR".

                   Der Scraper holt jetzt die Bilanz je Paarung mit
                   (vs_wins / vs_losses / vs_ties). Damit rechnet die
                   Major-Quote S/(S+N) und wird mit demselben
                   20-Partien-Prior geglaettet wie die Spalte links
                   (js/matchup-glaettung.js). Erst dadurch ist der Name
                   "Major-WR" keine Behauptung.

                   Fehlt die Bilanz in einer Zeile, bleibt majorWr null
                   und die Zelle zeigt einen Strich — die Partienzahl
                   steht trotzdem daneben. */
                majorWr: null,
                majorWrRoh: null,
                majorBilanzDa: false,
                majorSiege: null,
                majorNiederlagen: null,
                majorUnentschieden: null,
                majorAnzahl: null,
            };
        }).map(m => {
            const von = _majorMu ? (_majorMu[findKey(_majorMu, name)] || null) : null;
            const e = von ? (von[findKey(von, m.opponent)] || null) : null;
            if (e) {
                m.majorWr = (e.wr == null) ? null : e.wr;
                m.majorWrRoh = (e.wrRoh == null) ? null : e.wrRoh;
                m.majorSiege = (e.siege == null) ? null : e.siege;
                m.majorNiederlagen = (e.niederlagen == null) ? null : e.niederlagen;
                m.majorUnentschieden = (e.unentschieden == null) ? null : e.unentschieden;
                m.majorBilanzDa = !!e.bilanzDa;
                m.majorAnzahl = e.anzahl;
            }
            return m;
        }).sort((a, b) => b.winRate - a.winRate);
    }

    // ── rendering ───────────────────────────────────────────────────

    // Die Farbe sitzt auf einer 3 px hohen Oberkante, nie als Flaeche.
    // Genau so macht es die Bildkarte (js/ds-share.js, statCol) — und
    // seit dem 20.08.2026 macht es diese Karte auch, weil der Nutzer
    // das Aussehen des Bildes in der Seite haben wollte.
    //
    // Der Nebeneffekt ist der eigentliche Gewinn: die Zahl steht immer
    // in --arc-ink auf --arc-s1, 15,79:1, unabhaengig vom Wert. Solange
    // die Kachel selbst eingefaerbt war, musste jeder einzelne Farbton
    // gegen den Text geprueft werden.
    //
    // Vier Toene, gerastert — nie eine stufenlose Rampe. Blau/Rot statt
    // Gruen/Rot: das ist der haeufigste Fall von Farbfehlsichtigkeit.
    // Die Richtung traegt zusaetzlich der Pfeil, ganz ohne Farbe.
    const TONE_STRONG_AT = 15;      // points away from the neutral line

    function toneFor(delta) {
        if (delta == null || Math.abs(delta) < 0.05) return 'tie';
        return (delta > 0 ? 'up' : 'down') + (Math.abs(delta) >= TONE_STRONG_AT ? '-strong' : '');
    }

    // Two classes on purpose: the ROLE (rep / wr / conv) is the stable
    // hook for selectors and tests, the TONE is only the colour.
    function tile(role, tone, label, value, context, titleAttr, arrow) {
        /* DER HINWEIS HAENGT AN data-hinweis, NICHT MEHR NUR AN title
           (01.09.2026, aus dem Review derselben Aenderung).

           Am selben Tag sind die Nenner ("2.577 Listen im Meta", "aus
           12.271 Matches") von der Kachelflaeche in den Hinweis
           gezogen, weil sie dort zu viel Platz nahmen. Ein reines
           title-Attribut erscheint aber nur beim Verweilen mit der
           Maus — nie beim Klick und auf keinem Telefon. Die Nenner
           waeren damit fuer die Haelfte der Besucher schlicht weg, und
           genau dieses Argument steht zwei Dateien weiter in
           js/app-utils.js, wo termHint aus demselben Grund umgebaut
           wurde.

           Also dieselbe Loesung wie dort: die Sprechblase aus
           css/components.css, die auf Verweilen UND auf Fokus
           anspringt, plus aria-label fuer Vorlesegeraete. Das title
           bleibt NICHT zusaetzlich stehen — zwei Blasen uebereinander
           sind schlimmer als eine. */
        const hat = !!titleAttr;
        const ttl = hat
            ? ` data-hinweis="${esc(titleAttr)}" tabindex="0"`
              + ` aria-label="${esc(label)} ${esc(value).replace(/<[^>]*>/g, '')}: ${esc(titleAttr)}"`
            : '';
        const arw = arrow ? `<span class="arc-tile-arrow" aria-hidden="true">${arrow}</span>` : '';
        // Wert oben, Bezeichnung darunter — genau die Reihenfolge, in der
        // statCol() in js/ds-share.js die Bildkarte malt (Wert auf +62,
        // Bezeichnung auf +84, Herleitung auf +102).
        //
        // Das ist nicht nur Nachbau: mit der Bezeichnung oben stand der
        // Wert der dritten Kachel auf dem Telefon eine Zeile tiefer als
        // die der ersten, weil "Top-8 vs. Erw." umbricht und "Anteil"
        // nicht. Drei Zahlen nebeneinander, die nicht auf einer Linie
        // liegen, liest niemand als eine Reihe.
        /* Eine leere Kontextzeile ist keine Kontextzeile: sie kostet
           Hoehe und sieht aus wie eine Angabe, die nicht geladen hat. */
        const ctx = context ? `<div class="arc-tile-ctx">${context}</div>` : '';
        return `<div class="arc-tile arc-tile--${role} arc-tone--${tone}${
                hat ? ' arc-tile--hinweis' : ''}"${ttl}>
                <div class="arc-tile-value">${arw}${value}</div>
                <div class="arc-tile-label">${esc(label)}</div>
                ${ctx}
            </div>`;
    }

    /* Eine Kachel mit ZWEI Zahlen — links online, rechts Major.
     *
     * Die Herkunft steht unter jeder Zahl, nicht daneben und nicht im
     * Hinweis: die ganze Kachel existiert, weil die beiden Zahlen
     * verschieden sind, und eine Zahl ohne ihre Herkunft ist auf dieser
     * Seite der Fehler, aus dem alle anderen folgen.
     *
     * Fehlt die Major-Seite (Format ohne Praesenzturnier, Deck war nicht
     * dabei), steht dort ein Strich und darunter der Grund — nicht 0,0 %.
     * Eine Null liest sich als "hat nichts erreicht", und das ist etwas
     * ganz anderes als "war nicht da". */
    /* Die Summen der Praesenzseite — Nenner fuer die Hinweise.
       Einmal gerechnet, nicht je Kachel: die Karte zeichnet bis zu 30
       Kacheln je Seitenaufbau. */
    /* WORAUF RUHT DER ONLINE-ANTEIL? (07.09.2026, Befund B1)
     *
     * DER BEFUND. Fuer dasselbe Deck standen an zwei Stellen der Seite
     * zwei verschiedene Zahlen, beide als Anteil beschriftet, keine mit
     * ihrer Grundgesamtheit:
     *
     *   Startseite (js/meta-analysis-hub.js)   Dragapult  9,77 %
     *       Nenner: Summe total_brought ueber die 121 Zeilen von
     *       data/online_tournament_top8_decks.csv = 12.287 ANTRITTE.
     *   Diese Karte                            Dragapult  7,62 %
     *       Nenner: das Feld, gegen das LIMITLESS rechnet — nicht die
     *       Summe der gelisteten LISTEN.
     *
     * Zwei Groessen, zwei Grundgesamtheiten, ein Wort. Beide Zahlen sind
     * richtig; falsch war, dass keine sagte, wovon sie der Anteil ist.
     * Eine dritte, "vereinheitlichte" Zahl gibt es hier nicht — die
     * Quellen zaehlen wirklich Verschiedenes (Antritte an Turnieren
     * gegen gemeldete Listen des Onlinefeldes).
     *
     * DER NENNER STEHT NICHT IN DER DATEI. data/limitless_online_decks.csv
     * fuehrt count und share_numeric je Zeile, aber keine Feldgroesse; die
     * Anteile summieren sich auf 96,19 %, weil Limitless alles unterhalb
     * seiner Namensschwelle als "Other" fuehrt und der Scraper diese Zeile
     * weglaesst (backend/scrapers/limitless_online_scraper.py). Die Summe
     * der gelisteten Listen ist deshalb NICHT der Nenner: 3.138/39.694
     * waeren 7,91 %, die Datei sagt 7,62.
     *
     * Eingegrenzt wird er mit feldGroesseAusAnteilen() aus js/app-utils.js
     * — derselben Rechnung, mit der der Donut seinen Nenner findet, nicht
     * mit einer zweiten. Gemessen am Stand vom 06.09.2026: 41.200 Listen,
     * davon 39.694 benannt und 1.506 unter "Other"; 3.138/41.200 = 7,62 %
     * und trifft damit die Spalte der Datei.
     *
     * Laesst sich der Nenner nicht eingrenzen (Datei uneinig, Helfer
     * fehlt), gibt es KEINE Zahl — dann sagt der Hinweis, dass die
     * Grundgesamtheit nicht in der Datei steht. Ein geratener Nenner
     * waere hier schlimmer als gar keiner. */
    let _onlineFeldCache = null;
    function _onlineFeld() {
        if (_onlineFeldCache) return _onlineFeldCache;
        let gelistet = 0, anteilSumme = 0;
        const zeilen = [];
        for (const k of Object.keys(_decks || {})) {
            const anzahl = Number(_decks[k].count) || 0;
            const anteil = Number(_decks[k].share) || 0;
            if (anzahl > 0) { gelistet += anzahl; anteilSumme += anteil; }
            zeilen.push({ anteil: anteil, anzahl: anzahl });
        }
        const n = (typeof window !== 'undefined' && typeof window.feldGroesseAusAnteilen === 'function')
            ? window.feldGroesseAusAnteilen(zeilen) : 0;

        /* WIE SCHARF IST DER HOCHGERECHNETE NENNER? (Nachtrag zu B1,
           07.09.2026)
           -----------------------------------------------------------
           `n` ist KEINE gezaehlte Groesse. Bis heute stand er trotzdem
           wie eine da ("3.138 / 41.200"), und aus ihm folgte ein
           ebenso scheingenaues "1.506 Other".

           Hier wird deshalb nachgemessen, wie weit er wandern darf,
           ohne die Datei zu verletzen. Die Anteilsspalte steht auf
           zwei Nachkommastellen, jede Zeile laesst also ein Intervall
           zu:

               count / ((share + 0,005) / 100)  ..  count / ((share - 0,005) / 100)

           Der Schnitt ueber alle Zeilen, DIE MIT n EINIG SIND, ist die
           Spanne, die hier ausgegeben wird. Gemessen am Stand vom
           07.09.2026: 41.191,9 bis 41.207,2 — n = 41.200 liegt darin,
           und "Other" liegt damit zwischen 1.498 und 1.513, nicht auf
           1.506.

           Das ist KEINE zweite Rechnung fuer den Nenner: n kommt
           weiter allein aus feldGroesseAusAnteilen() (js/app-utils.js).
           Gemessen wird nur seine Schaerfe. Zeilen, deren Intervall n
           nicht enthaelt, bleiben draussen — sonst waere die Spanne
           leer, sobald eine einzige Zeile der Datei aus der Reihe
           faellt (genau der Fall Wailord vom 03.09.2026). */
        let von = 0, bis = Infinity;
        if (n > gelistet) {
            for (const z of zeilen) {
                if (!(z.anzahl > 0) || !(z.anteil > 0.005)) continue;
                const u = z.anzahl / ((z.anteil + 0.005) / 100);
                const o = z.anzahl / ((z.anteil - 0.005) / 100);
                if (!(u <= n && n <= o)) continue;
                if (u > von) von = u;
                if (o < bis) bis = o;
            }
        }
        const spanne = (n > gelistet && von > gelistet && isFinite(bis) && bis >= von)
            ? { von: von, bis: bis } : null;

        _onlineFeldCache = {
            gelistet: gelistet,
            // Summe der Anteilsspalte — die Luecke zu 100 % IST das,
            // was Limitless unter "Other" fuehrt, und der Grund, warum
            // der Nenner ueber der Summe der gelisteten Listen liegt.
            anteilSumme: anteilSumme,
            listen: (n > gelistet) ? n : null,
            other: (n > gelistet) ? (n - gelistet) : null,
            // Spanne des Nenners und, daraus, die Spanne von "Other".
            // null heisst: nicht messbar — dann steht auch keine da.
            spanne: spanne,
            otherSpanne: spanne
                ? { von: spanne.von - gelistet, bis: spanne.bis - gelistet } : null,
        };
        return _onlineFeldCache;
    }

    let _majorFeldCache = null;
    function _majorFeld() {
        if (_majorFeldCache) return _majorFeldCache;
        let antritte = 0, day1 = 0, day2 = 0;
        for (const k of Object.keys(_major || {})) {
            antritte += _major[k].antritte || 0;
            day1 += _major[k].day1 || 0;
            day2 += _major[k].day2 || 0;
        }
        _majorFeldCache = {
            antritte, day1, day2,
            day2Quote: day1 > 0 ? (day2 / day1) * 100 : null,
        };
        return _majorFeldCache;
    }

    /* ── AUS WELCHEM FORMAT STAMMEN DIE PRAESENZZAHLEN? ──────────────
     *
     * BESTELLT (Betreiber, 11.09.2026, mit Blick auf den Formatwechsel
     * zu TEF-30C am 25.09.): „sobald das Format wechselt, dann halt
     * irgendwie den Hinweis geben, dass die Major-Daten noch vom alten
     * Format sind. Wenn die Major-Daten im gleichen Format sind, dann
     * ist es egal … sodass man halt vielleicht noch mal neben dem Major
     * dann halt hinschreibt, in welchem Format das war."
     *
     * Genau so: im Normalfall steht weiter schlicht „Major" da. Nur wenn
     * der Auszug, aus dem die Praesenzzahlen kommen, ein ANDERES Format
     * traegt als das laufende, wird der Formatschluessel angehaengt —
     * dann vergleicht die Zeile naemlich zwei verschiedene Kartenpools,
     * und das muss dastehen, wo die Zahl steht.
     *
     * Beides kommt aus den Daten, nicht aus einer Liste: der Schluessel
     * des Auszugs aus _majorZeitraum.key (gesetzt beim Laden der
     * data/labs_tournament_decks_<Format>.csv), das laufende Format aus
     * window.getCurrentMetaFormat() (gespeist von
     * data/format_window.json). Ist eines von beiden unbekannt, wird
     * nichts behauptet.
     */
    function majorFormatFremd() {
        const z = _majorZeitraum;
        const auszug = (z && z.key) ? String(z.key).trim().toUpperCase() : '';
        const jetzt = (typeof window !== 'undefined'
            && typeof window.getCurrentMetaFormat === 'function')
            ? String(window.getCurrentMetaFormat() || '').trim().toUpperCase() : '';
        if (!auszug || !jetzt || auszug === jetzt) return '';
        return auszug;
    }

    /* Die Day-2-Kachel ist die einzige, die NUR Praesenzzahlen zeigt —
       ohne Online-Zeile daneben, an der man das Format ablesen koennte.
       Steht der Auszug in einem anderen Format, gehoert der Schluessel
       deshalb in die Ueberschrift selbst. */
    function day2Label() {
        const de = isDe();
        const grund = L('arc.day2Label', de ? 'Day-2-Quote (Major)' : 'Day 2 rate (major)');
        const fremd = majorFormatFremd();
        return fremd ? grund.replace(/\)$/, ' · ' + fremd + ')') : grund;
    }

    function majorQuelle() {
        const fremd = majorFormatFremd();
        return fremd
            ? L('arc.quelleMajor', 'Major') + ' · ' + fremd
            : L('arc.quelleMajor', 'Major');
    }

    function tileGeteilt(role, tone, label, onlineWert, onlineAnzahl, majorWert, majorAnzahl, majorLeer, majorDuenn, tip, pfeil) {
        const de = isDe();
        const hat = !!tip;
        const ttl = hat
            ? ` data-hinweis="${esc(tip)}" tabindex="0"`
              + ` aria-label="${esc(label)} — ${de ? 'online' : 'online'} ${
                    esc(String(onlineWert).replace(/<[^>]*>/g, ''))}, Major ${
                    esc(String(majorWert || majorLeer).replace(/<[^>]*>/g, ''))}: ${esc(tip)}"`
            : '';
        const arw = pfeil ? `<span class="arc-tile-arrow" aria-hidden="true">${pfeil}</span>` : '';
        /* Herkunft LINKS, Zahl RECHTS, eine Zeile je Quelle.
         *
         * Bis zum 02.09.2026 standen die beiden nebeneinander, die Zahl
         * oben und die Herkunft darunter. Auf der echten Kartenbreite
         * (rund 380 px, auch am Schreibtisch) blieben je Haelfte 40 px,
         * und "22,2 %" braucht 50 — die Zahlen schoben sich uebereinander
         * und standen als "7,5 %4,1 %" da.
         *
         * Gestapelt passt es in jede Kachelbreite. Und die Ueberschrift
         * steht jetzt oben, wie vom Betreiber vorgeschlagen: sie gilt fuer
         * beide Zahlen, also gehoert sie ueber beide und nicht unter sie. */
        /* Drei Felder je Zeile: woher, wie viel, worauf es steht.
         *
         * Vorher trug die Quellenbeschriftung die Zahl mit sich —
         * "Major \u00b7 172 Antritte", "Major \u00b7 1.277 Partien" — und online
         * stand gar keine. Rueckmeldung vom 02.09.2026: "das Wort Antritte
         * kannst du weglassen, wenn wir da aber schon eine Zahl hinschreiben
         * wie viele Leute das Deck genutzt haben, dann sollten wir das bei
         * Online auch machen \u2026 und dann sollten wir die Online Matches da
         * auch als Zahl erwaehnen."
         *
         * Also dieselbe Aufteilung wie in der Heatmap-Zelle: links die
         * Quelle, in der Mitte der Wert, rechts die Stueckzahl, auf der er
         * ruht. Beide Zeilen tragen dieselben drei Felder, damit man
         * senkrecht vergleichen kann, ohne zu suchen. */
        const halb = (wert, quelle, anzahl, schwach, duenn) =>
            `<div class="arc-halb${schwach ? ' arc-halb--leer' : ''}${
                duenn ? ' arc-halb--duenn' : ''}">
                <span class="arc-halb-quelle">${esc(quelle)}</span>
                <span class="arc-tile-value">${wert}</span>
                <span class="arc-halb-anzahl">${anzahl ? esc(anzahl) : ''}</span>
            </div>`;
        return `<div class="arc-tile arc-tile--${role} arc-tile--geteilt arc-tone--${tone}${
                hat ? ' arc-tile--hinweis' : ''}"${ttl}>
                <div class="arc-tile-label">${esc(label)}</div>
                <div class="arc-halbe">
                    ${halb(arw + onlineWert, L('arc.quelleOnline', 'online'),
                        onlineAnzahl, false, false)}
                    ${halb(majorWert || '–', majorQuelle(),
                        majorWert ? majorAnzahl : (majorLeer || ''),
                        !majorWert, majorWert && majorDuenn)}
                </div>
            </div>`;
    }

    function tilesHtml(name, variante) {
        const de = isDe();
        const d = _decks[findKey(_decks, name)] || null;
        // Ohne Leerzeichen hinter dem Pfeil: es steckte im span mit
        // 0,6em Groesse und kostete auf dem Schreibtisch rund 14 px —
        // genug, dass "▲ +59,2 %" in seiner Kachel um 4 px anstiess und
        // das Prozentzeichen abgeschnitten wurde. Den Abstand setzt
        // jetzt margin-right in css/styles.css, in px statt in em.
        const arrow = (v) => (Math.abs(v) < 0.05 ? '' : (v > 0 ? '▲' : '▼'));

        /* DIE NENNER STEHEN SEIT DEM 01.09.2026 IM HINWEIS, NICHT AUF
           DER KACHELFLAECHE.
           Gemeldet: "'2.577 Listen im Meta' brauchen wir, glaube ich,
           nicht. Dann '54 % Winrate aus so und so vielen Matches'
           brauchen wir, glaube ich, auch nicht."

           Geloescht sind sie deshalb nicht: eine Quote ohne Nenner ist
           auf dieser Seite der Fehler, aus dem alles andere folgt. Sie
           haengen an der Kachel und sind ueber Verweilen, Klick und
           Tastatur erreichbar (siehe tile()).

           Und zwar HIER und nur hier: unter Quellen & Methodik stehen
           die Summen des ganzen Datenraums, nicht der Nenner je Deck.
           Ein frueherer Kommentar an dieser Stelle behauptete das
           Gegenteil — der Hinweis an der Kachel ist die einzige Stelle,
           an der "2.577" steht, und muss es deshalb bleiben. */
        const m = _major ? (_major[findKey(_major, name)] || null) : null;
        const majorLeer = L('arc.keinMajor', de ? 'kein Major' : 'no major');

        /* BEFUND B1 (07.09.2026): DIE GRUNDGESAMTHEIT STEHT JETZT DA —
           UND ZWAR ALS DAS, WAS SIE IST.
           Rechts stand bis zum Vormittag nur die Zahl der gemeldeten
           Listen — 3.138 neben "7,62 %", und 3.138 durch irgendetwas
           Sichtbares ergibt diese Quote nicht. Der Nenner ist das
           Onlinefeld, in dem auch die unbenannten "Other"-Listen
           stecken; er wird in _onlineFeld() aus der Datei
           hochgerechnet, nicht abgeschrieben.

           NACHTRAG DESSELBEN TAGES. Danach stand "3.138 / 41.200" da,
           beide Zahlen in derselben Schreibweise — als haette jemand
           41.200 Listen gezaehlt. Hat niemand: 41.200 ist die Mitte
           eines Bereichs (41.192 bis 41.207), den die Anteilsspalte
           zulaesst, und "1.506 Other" war 41.200 minus 39.694, also
           irgendwo zwischen 1.498 und 1.513. Zwei Scheingenauigkeiten
           aus einer Schaetzung.

           Jetzt traegt die Kachel "3.138 / ≈ 41.200", und der Hinweis
           sagt den Rechenweg, die Spanne und dass "Other" rund 1.500
           sind. Gezaehlt ist an diesem Bruch nur der Zaehler. */
        const _oFeld = _onlineFeld();
        /* Die Spanne des hochgerechneten Nenners und, daraus, die von
           "Other". Fehlt sie (Datei uneinig), bleibt der Satz weg —
           eine erfundene Spanne waere schlimmer als keine. */
        const _sp = _oFeld.spanne;
        const _osp = _oFeld.otherSpanne;
        const _spanneSatz = _sp
            ? (de ? ` (eingegrenzt auf ${fmtGanz(_sp.von)} bis ${fmtGanz(_sp.bis)})`
                  : ` (bracketed to ${fmtGanz(_sp.von)}–${fmtGanz(_sp.bis)})`)
            : '';
        const _otherSpanneSatz = _osp
            ? (de ? `, je nach Nenner ${fmtGanz(_osp.von)} bis ${fmtGanz(_osp.bis)}`
                  : `, ${fmtGanz(_osp.von)}–${fmtGanz(_osp.bis)} depending on the base`)
            : '';
        /* "rund 1.500" statt "1.506": auf Hundert gerundet ist der Wert
           breiter als die Spanne (15 Listen) und behauptet damit nicht
           mehr, als die Rechnung hergibt. */
        const _otherRund = fmtGanz(Math.round((_oFeld.other || 0) / 100) * 100);
        const rep = d
            ? tileGeteilt('rep', 'neutral', L('arc.repLabel', de ? 'Anteil' : 'Share'),
                `${esc(fmt(d.share))} %`,
                /* Rechts steht, worauf der Anteil ruht: online die Listen
                   dieses Decks UEBER der Grundgesamtheit des Onlinefeldes,
                   beim Major die Zahl der Antritte (deren Nenner im Hinweis
                   steht). Beides ist "so viele Leute haben das Deck
                   gespielt", nur aus zwei Quellen. */
                /* NUR EINE ZAHL JE ZEILE (11.09.2026).
                   Hier stand „3.683 / ≈ 45.591" — Zaehler und
                   hochgerechneter Nenner. Gemeldet: „irgendwie stehen da
                   bei online zwei verschiedene Zahlen. Also da auf jeden
                   Fall nur eine Zahl schreiben."
                   Es bleibt die GEZAEHLTE: die Listen dieses Decks. Der
                   hochgerechnete Nenner war ohnehin der fragwuerdigere
                   der beiden und steht unveraendert im Hinweis, samt
                   Rechenweg und Spanne. Damit tragen beide Zeilen
                   dasselbe: wie viele Leute das Deck gespielt haben,
                   online und auf Praesenzturnieren. */
                fmtGanz(d.count),
                m ? `${esc(fmt(m.share))} %` : '',
                m ? fmtGanz(m.antritte) : '',
                majorLeer,
                false,
                /* KEIN NEUER i18n-SCHLUESSEL: js/i18n.js gehoert einem
                   anderen Arbeitspaket. Zweisprachig inline ueber
                   getLang(), wie es das Projekt an Dutzenden Stellen
                   macht (siehe praesenzNote weiter unten). */
                (_oFeld.listen
                    ? (de
                        ? 'Anteil am Onlinefeld: der Bruch {n} / {g}. Gezählt ist davon nur der Zähler (Spalte count in data/limitless_online_decks.csv). Der Nenner steht in KEINER Spalte — er ist aus den Anteilen derselben Datei HOCHGERECHNET: {s} Listen sind namentlich gelistet und tragen zusammen {a} % der Anteile, den Rest führt Limitless als „Other“. Daraus ≈ {g} Listen{u}. Unter „Other“ liegen danach rund {r} Listen ({g} − {s} = {o}{c}) — auch diese Zahl ist nicht gezählt. NICHT dieselbe Größe wie der Meta-Anteil auf der Startseite: der zählt Antritte an Online-Turnieren aus data/online_tournament_top8_decks.csv. {mj}'
                        : 'Share of the online field: the fraction {n} / {g}. Only the numerator is counted (column count in data/limitless_online_decks.csv). The base appears in NO column — it is EXTRAPOLATED from the file\u2019s own shares: {s} lists are named and carry {a} % of the shares between them, the remainder is what Limitless groups as \u201cOther\u201d. Hence ≈ {g} lists{u}. \u201cOther\u201d is then about {r} lists ({g} − {s} = {o}{c}) — that figure is not counted either. NOT the same quantity as the meta share on the home page: that one counts entries at online tournaments from data/online_tournament_top8_decks.csv. {mj}')
                        .replace('{u}', _spanneSatz)
                        .replace('{c}', _otherSpanneSatz)
                        .replace('{r}', _otherRund)
                        .replace('{a}', fmt(_oFeld.anteilSumme, 2))
                        .replace(/\{s\}/g, fmtGanz(_oFeld.gelistet))
                        .replace('{o}', fmtGanz(_oFeld.other))
                        .replace(/\{g\}/g, fmtGanz(_oFeld.listen))
                    : (de
                        ? '{n} Listen im Meta online. Die Grundgesamtheit, gegen die Limitless diesen Anteil rechnet, steht nicht in data/limitless_online_decks.csv und ließ sich aus den Anteilen der Datei nicht eingrenzen — deshalb steht hier keine. {mj}'
                        : '{n} lists in the online field. The base Limitless computes this share against is not in data/limitless_online_decks.csv and could not be bracketed from the file\u2019s shares — so none is given. {mj}'))
                    .replace('{n}', fmtGanz(d.count))
                    .replace('{mj}', m
                        ? L('arc.repTipMajor', de
                            ? 'Auf Präsenzturnieren {a} von {g} Antritten.'
                            : 'At in-person events {a} of {g} entries.')
                            .replace('{a}', fmtGanz(m.antritte))
                            .replace('{g}', fmtGanz(_majorFeld().antritte))
                        : L('arc.repTipOhne', de
                            ? 'Für dieses Format gibt es noch kein Präsenzturnier mit diesem Deck.'
                            : 'No in-person event with this deck in this format yet.')))
            : tile('rep', 'tie', L('arc.repLabel', de ? 'Anteil' : 'Share'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));

        /* ── BEFUND B3 (07.09.2026): EINE DATEI, ZWEI MAJOR-QUOTEN ──
         *
         * Diese Kachel rechnet die Major-Quote aus wins/losses/ties der
         * Datei data/labs_tournament_decks_<Format>.csv neu, als
         * S/(S+N+U) (siehe _majorLaden(): "Siege durch ALLE Partien").
         * Der Reiter „Past Meta“ (js/app-past-meta.js) zeigt aus
         * DERSELBEN Datei die Spalte win_pct — das sind Matchpunkte
         * (3S+U)/(3·Partien), und die heißen bei Limitless „Win %".
         *
         * Beide sind richtig gerechnet, und beide bleiben: die
         * Entscheidung des Betreibers vom 01.09.2026 („online wird die
         * winrate ganz normal gewonnene kaempfe durch gesamtanzahl
         * kaempfe genommen") gilt für diese Karte, damit ihre linke und
         * rechte Spalte auf EINER Skala stehen. Zwei Skalen auf einem
         * Bildschirm wären der schlimmere Fehler.
         *
         * Was hier fehlte, war der Name. Ohne ihn stehen zwei Zahlen für
         * dasselbe Deck auf zwei Reitern, und nichts sagt, warum sie
         * auseinandergehen. Der Kurzname kommt aus
         * js/win-rate-konvention.js — abgeschrieben wird er nicht (siehe
         * die Begründung bei quoteName in zeitraumHtml()).
         *
         * ERLEDIGT — der Absatz stimmte schon beim Committen nicht
         * (nachgesehen 10.09.2026). Hier stand: „OFFEN und NICHT hier zu
         * lösen: js/app-past-meta.js … sagt nicht, dass die Deck-Analyse
         * dieselbe Datei anders rechnet."
         *
         * Derselbe Commit b1de7075 (08.09.2026) hat das dort geschlossen:
         * js/app-past-meta.js:2058-2074 baut `winPctKonvSatz` und schreibt
         * genau diesen Gegenverweis in den title der Kachel (:2089). Der
         * OFFEN-Text war eine Textleiche und hätte den nächsten Leser eine
         * Aufgabe suchen lassen, die es nicht gibt. */
        function _wrKonventionsSatz(deutsch) {
            var K = (typeof window !== 'undefined') ? window.WinRateKonvention : null;
            if (!K) return '';
            var mit = K.kurz('mitUnentschieden');
            var mp = K.kurz('matchpunkte');
            var fMit = K.hol('mitUnentschieden') ? K.hol('mitUnentschieden').formel : '';
            var fMp = K.hol('matchpunkte') ? K.hol('matchpunkte').formel : '';
            /* Kein neuer i18n-Schlüssel: js/i18n.js gehört einem anderen
               Arbeitspaket. Zweisprachig inline über getLang(). */
            return deutsch
                ? ' Konvention beider Spalten: ' + mit + ' (' + fMit + ') — NICHT „' + mp
                  + '“ (' + fMp + '). Der Reiter „Past Meta“ zeigt aus derselben '
                  + 'Major-Datei die Spalte win_pct, also ' + mp + '; deshalb steht dort '
                  + 'für dasselbe Deck eine andere Zahl.'
                : ' Convention of both columns: ' + mit + ' (' + fMit + ') — NOT \u201c' + mp
                  + '\u201d (' + fMp + '). The Past Meta tab shows the win_pct column of the '
                  + 'same major file, i.e. ' + mp + '; that is why the same deck reads '
                  + 'differently there.';
        }

        const wrDelta = d ? d.winRate - 50 : null;
        // Gezeigt, sobald es Partien gibt. Wie sicher sie ist, steht daneben.
        const wrMajor = (m && m.winRate != null && m.partien > 0)
            ? `${esc(fmt(m.winRate))} %` : '';
        // Halbe Breite des 95-%-Intervalls, in Prozentpunkten. Bei einer
        // Quote nahe 50 % ist 1,96·sqrt(0,25/n) die konservative Schaetzung —
        // sie wird nie zu schmal.
        const wrKi = (m && m.partien > 0) ? 196 * Math.sqrt(0.25 / m.partien) : null;
        const wrDuenn = !!(m && m.partien > 0 && m.partien < MAJOR_DUENN_PARTIEN);
        const wr = d
            ? tileGeteilt('wr', toneFor(wrDelta), mitQuote(L('arc.wrLabel', '{quote}'), 'mitUnentschieden'),
                `${esc(fmt(d.winRate))} %`,
                /* Die Matchzahl steht MIT auf der Zeile, nicht nur im
                   Hinweis: sie ist die Zahl, an der man entscheidet, ob man
                   der Quote glaubt, und ein Hinweis erscheint erst beim
                   Verweilen — auf dem Telefon also nie. Seit dem 02.09.2026
                   auch fuer online, vorher stand sie nur beim Major. */
                fmtGanz(d.partien),
                wrMajor,
                (m && m.partien > 0) ? fmtGanz(m.partien) : '',
                majorLeer,
                wrDuenn,
                /* DIE REMISQUOTE STEHT HIER, UND SIE MUSS ES.
                   Beide Zahlen sind Siege durch ALLE Partien — dieselbe
                   Rechnung, Entscheidung des Betreibers. Nur enden am
                   Major 10,98 % der Partien unentschieden und online
                   1,26 %. Das kostet die rechte Spalte rund fuenf Punkte,
                   ohne dass ein Deck schlechter gespielt haette.
                   Dragapult: 54,1 online gegen 42,4 Major, bei 12,1 %
                   Unentschieden. Ohne diesen Satz liest sich das als
                   Leistungseinbruch — und das waere falsch. */
                L('arc.wrTip2', de
                    ? 'Siege geteilt durch alle Matches, auf beiden Seiten gleich gerechnet. Online aus {n} Matches. {mj}'
                    : 'Wins divided by all games, same on both sides. Online from {n} games. {mj}')
                    .replace('{n}', fmtGanz(d.partien))
                    .replace('{mj}', (m && m.partien > 0)
                        ? L('arc.wrTipMajor', de
                            ? 'Major aus {p} Matches, davon {u} % unentschieden — online sind es 1,3 %. Unentschieden zählen auf beiden Seiten nicht als Sieg, drücken die Major-Spalte also spürbar. Bei dieser Matchzahl liegt der Wert auf ±{k} Punkte genau.'
                            : 'Major from {p} games, {u} % of them ties — online it is 1.3 %. Ties count as non-wins on both sides, so they push the major column down. At this sample the value is accurate to ±{k} points.')
                            .replace('{p}', fmtGanz(m.partien))
                            .replace('{u}', fmt(m.remisQuote))
                            .replace('{k}', fmt(wrKi, 0))
                        : L('arc.wrTipOhne', de
                            ? 'Noch keine Major-Matches für dieses Deck in diesem Format.'
                            : 'No in-person games for this deck in this format yet.'))
                    + _wrKonventionsSatz(de),
                arrow(wrDelta))
            : tile('wr', 'tie', mitQuote(L('arc.wrLabel', '{quote}'), 'mitUnentschieden'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));

        // The conversion file covers fewer decks than the deck list —
        // 111 of 127. A silent 0 would read as "never converts", which is
        // the opposite of "we have no tournament data for this deck".
        const c = _conv ? _conv.decks.find(x =>
            String(x.name).toLowerCase() === String(name).toLowerCase()) : null;
        /* DIE DRITTE KACHEL HIESS BIS ZUM 01.09.2026 "Top-8 vs. Erw."
           UND ZEIGTE "+59,2 %".
           Gemeldet: "'plus 59 % Top 8 wird erwartet…' Ja, den Bereich
           verstehe ich noch nicht so ganz, auch mit der Erklaerung ist
           es darunter verwirrend."
           Zu Recht: +59,2 % war kein Prozentsatz einer Quote, sondern
           ein Vergleich zweier Quoten — und stand mit Prozentzeichen
           neben zwei echten Prozentwerten. Wer das als "erreicht in
           59 % der Faelle die Top 8" liest, liegt um den Faktor sechs
           daneben.

           WARUM HIER DER FELD-SCHNITT STEHT UND NICHT DAS VIELFACHE
           (Befund aus dem Review derselben Aenderung):

           Die erste Fassung schrieb die ROHE Quote gross und das
           GEGLAETTETE Vielfache darunter. Das sind zwei Groessen aus
           zwei Rechnungen, und sie gehen auseinander: Marnie's
           Grimmsnarl stand mit "13,0 % · 1,2-mal so oft wie der
           Schnitt" da, obwohl 13,0 / 6,19 = 2,1 ist. In 68 von 120
           Decks wich das nachrechenbare Verhaeltnis um mindestens 0,5
           vom angezeigten Vielfachen ab. Zwei Zahlen nebeneinander, die
           sich nicht ineinander umrechnen lassen, sind schlimmer als
           eine Zahl allein — der Leser haelt sich fuers Rechnen zu
           dumm, statt der Anzeige zu misstrauen.

           Jetzt steht daneben, wogegen verglichen wird: der
           Feld-Durchschnitt, roh wie die Quote darueber. 13,0 gegen
           6,2 — das rechnet jeder selbst, und es stimmt. Das
           geglaettete Vielfache bleibt in der Rangliste, wo es als
           geglaettet beschriftet ist, seine eigene Spalte hat und unter
           der Mindestzahl ehrlich schweigt. */
        const quote = c && c.brought > 0 ? (c.top8 / c.brought) * 100 : null;
        const schnitt = (_conv && isFinite(_conv.expected)) ? _conv.expected * 100 : null;
        const conv = (c && quote != null)
            ? tile('conv', toneFor(c.perfPct),
                L('arc.convLabel3', de ? 'Top-8-Quote (online)' : 'Top-8 rate (online)'),
                `${esc(fmt(quote))} %`,
                esc(schnitt != null
                    ? L('arc.convCtx2', de ? 'Schnitt aller Decks {s} %'
                                           : 'field average {s} %')
                        .replace('{s}', fmt(schnitt))
                    : ''),
                // WICHTIG: c.brought zaehlt NICHT dieselbe Grundgesamtheit wie
                // d.count. d.count sind alle Listen aus allen Onlineturnieren
                // (Dragapult 2.158). c.brought sind nur die Antritte auf
                // Turnieren MIT gewertetem Top-8-Schnitt (755, aus 103
                // Turnieren). Nebeneinander sieht das aus wie ein Widerspruch,
                // wenn man es nicht dazuschreibt — also steht es im Hinweis.
                (_convGezaehlt
                    ? L('arc.convTip3', de
                        ? '{t} von {b} Antritten auf Turnieren mit Top-8-Schnitt.'
                        : '{t} of {b} entries at events with a top-8 cut.')
                    : L('arc.convTip2', de
                        ? '{t} von {b} gewichteten Antritten auf Turnieren mit Top-8-Schnitt.'
                        : '{t} of {b} weighted entries at events with a top-8 cut.'))
                    /* fmtGewichtet schreibt ganze Zahlen ohne
                       Nachkomma — gezaehlte Antritte sind ganze
                       Zahlen, also braucht es keine zweite Funktion. */
                    .replace('{t}', fmtGewichtet(c.top8))
                    .replace('{b}', fmtGewichtet(c.brought))
                + (c.thin ? ' ' + L('arc.convThin2', de
                    ? 'Kleine Stichprobe — die Quote steht auf wenigen Antritten und schwankt stark.'
                    : 'Small sample — the rate rests on few entries and swings hard.') : ''),
                arrow(c.perfPct))
            : tile('conv', 'tie', L('arc.convLabel3', de ? 'Top-8-Quote (online)' : 'Top-8 rate (online)'),
                '–',
                esc(L('arc.convMissing', de ? 'zu wenig Daten' : 'not enough data')),
                /* Der Satz zeigt auf die Kachel darueber, und die rechnet
                   S/(S+N+U) — deshalb traegt er deren Namen, nicht den
                   Hausnamen. */
                mitQuote(L('arc.convMissingTip', de
                    ? 'Dieses Deck fehlt in der Top-Cut-Datei. Das heißt nicht, dass es nie konvertiert — die {quote} stammt aus einer anderen Quelle.'
                    : 'This deck is absent from the top-cut file. That does not mean it never converts — the {quote} comes from a different source.'), 'mitUnentschieden'));
        /* DIE VIERTE KACHEL: DAY 2, UND SIE HAT KEINE ONLINE-SEITE.
           Die dritte traegt die Top-8-Quote der Online-Turniere, die
           vierte die Day-2-Quote vom Major. Das ist absichtlich KEIN
           Paar aus zwei Spalten:

             - Ein Major vergibt acht Cut-Plaetze. 22 von 27 Decks stehen
               dort auf null; eine Major-Top-8-Quote waere fast ueberall
               0,0 % und saehe aus wie ein Befund, wo eine Feldgroesse
               steht.
             - Day 2 gibt es online gar nicht. Online-Turniere haben
               keinen zweiten Tag.

           Also zwei Kacheln, jede mit ihrer Herkunft in der
           Beschriftung, keine mit einer leeren Gegenspalte. So hat es
           der Betreiber entschieden: "online gibt es keine
           Day-Two-Daten. Von den Onlinern nehmen wir die
           Top-8-Platzierungen. Wir ergaenzen einfach nur noch die
           Day-Two-Quote fuer Major."

           Gemessen am 01.09.: Feldschnitt 18,2 % (141 von 774). Und die
           Zahl traegt etwas — Dragapult bringt den groessten Anteil mit
           (22,2 %) und kommt mit 12,8 % unterdurchschnittlich durch,
           Alakazam Dudunsparce mit 26,4 % ueberdurchschnittlich. */
        const feld = _majorFeld();
        const d2 = (m && m.day2Quote != null && m.day1 >= DAY2_MIN_ANTRITTE)
            ? tile('day2', toneFor(feld.day2Quote != null ? m.day2Quote - feld.day2Quote : 0),
                day2Label(),
                `${esc(fmt(m.day2Quote))} %`,
                esc(feld.day2Quote != null
                    ? L('arc.day2Ctx', de ? 'Schnitt aller Decks {s} %' : 'field average {s} %')
                        .replace('{s}', fmt(feld.day2Quote))
                    : ''),
                L('arc.day2Tip', de
                    ? '{d2} von {d1} Antritten haben Tag 2 erreicht. Nur Präsenzturniere — online gibt es keinen zweiten Tag.'
                    : '{d2} of {d1} entries made day 2. In-person events only — online has no second day.')
                    .replace('{d2}', fmtGanz(m.day2))
                    .replace('{d1}', fmtGanz(m.day1)),
                arrow(feld.day2Quote != null ? m.day2Quote - feld.day2Quote : 0))
            : tile('day2', 'tie',
                day2Label(),
                '–',
                esc(m
                    ? L('arc.day2Duenn', de ? 'zu wenige Antritte' : 'too few entries')
                    : L('arc.keinMajor', de ? 'kein Major' : 'no major')),
                m
                    ? L('arc.day2DuennTip', de
                        ? 'Dieses Deck stand mit {d1} Antritten am Start — zu wenige für eine Quote.'
                        : 'This deck had {d1} entries — too few for a rate.')
                        .replace('{d1}', fmtGanz(m.day1))
                    : L('arc.day2OhneTip', de
                        ? 'Für dieses Format gibt es noch kein Präsenzturnier mit diesem Deck. Day 2 ist eine reine Präsenzgröße.'
                        : 'No in-person event with this deck in this format yet. Day 2 is in-person only.'));

        /* DER ZEITRAUMSATZ STEHT NICHT MEHR AUF DER KARTE (11.09.2026).
           Gemeldet: „Dann haben wir hier irgendwie so ne
           Zeitraumbeschreibung drinne. Die Zeitraumbeschreibung, die
           kann auf jeden Fall komplett weg, und dann wuerd ich lieber
           gucken, dass wir den freigewordenen Platz irgendwie sinnvoller
           nutzen."

           Er ist nicht geloescht, sondern umgezogen: derselbe Text stand
           WORTGLEICH unter jeder der 29 Karten — er beschreibt das
           Format, nicht das Deck. Einmal hinter dem Info-Knopf des
           Abschnitts „Tier-Liste" sagt er dasselbe und kostet nichts.
           Gemeldet wird er von erklaerungHtml() weiter unten. */
        /* EINE AUSNAHME: die eingebettete Fassung in der Deck-Analyse.
           Dort gibt es das Bedienelement „Daten ab", auf das sich der
           letzte Satz bezieht — und KEINEN Abschnitts-Info-Knopf, hinter
           den der Text sonst wandert. Ihn dort wegzunehmen hiesse, die
           Antwort auf „wirkt mein Datenfenster hier?" ersatzlos zu
           streichen. */
        return `<div class="arc-tiles arc-tiles--vier">${rep}${wr}${conv}${d2}</div>`
             + (variante === 'embed' ? zeitraumHtml(variante) : '');
    }

    /* ── WELCHEN ZEITRAUM ZEIGEN DIESE VIER KACHELN? ────────────────────
     *
     * BEFUND A-F4.7 (07.09.2026, live gemessen): das Datenfenster
     * "Daten ab" der Deck-Analyse wirkt auf die Kartenuebersicht, aber
     * nicht auf diese Kacheln — Anteil, Quote, Top-8 und Day-2 bleiben
     * bei jedem Fensterwechsel identisch. `grep currentMetaDateFrom` in
     * dieser Datei: 0 Treffer.
     *
     * WARUM DAS SO BLEIBT (nachgesehen, nicht angenommen):
     *
     *   data/limitless_online_decks.csv   Spalten: rank, deck_name, count,
     *       share, share_numeric, wins, losses, ties, win_rate,
     *       win_rate_numeric. KEIN Datumsfeld, keine Turnierzeile — die
     *       Datei ist ein fertig aufsummierter Stand des Onlinefeldes.
     *       Anteil und Quote lassen sich daraus fuer kein Fenster neu
     *       rechnen.
     *   data/online_tournament_top8_decks.csv   fuehrt genau EIN Datum je
     *       Deck (last_seen_date); die Antritte und Top-8-Zahlen daneben
     *       sind ueber alle Turniere aufsummiert. Eine Quote fuer ein
     *       Fenster ist daraus nicht zu gewinnen.
     *   data/online_tournament_dated_cards.csv  hat zwar tournament_date je
     *       Zeile, aber keine Bilanz (keine wins/losses/ties), keine
     *       Top-8- und keine Day-2-Spalte. Man koennte daraus einen
     *       gefensterten ANTEIL bilden — auf einer anderen
     *       Grundgesamtheit als die drei Zahlen daneben. Genau das ist der
     *       Fehler, den diese Datei an zwei Stellen schon beschrieben
     *       abgearbeitet hat: eine Zahl, die still ihre Grundgesamtheit
     *       wechselt, waehrend die Nachbarzahl es nicht tut.
     *
     * Also der zweite zulaessige Weg: das Fenster wirkt hier nicht, und
     * das STEHT JETZT DA — mit Datei und, wo die Daten es hergeben, mit
     * dem Zeitraum, den sie wirklich abdecken. Der Satz zum Datenfenster
     * erscheint nur in der eingebetteten Fassung; nur dort gibt es das
     * Bedienelement, auf das er sich bezieht.
     */
    function zeitraumHtml(variante) {
        const text = zeitraumText(variante);
        /* Der Stil steht inline, weil css/ in dieser Runde gesperrt war.
           Sobald es eine Regel .arc-zeitraum gibt, gehoert er dorthin. */
        return `<p class="arc-zeitraum" title="${esc(text)}"`
             + ` style="margin:8px 0 0;font-size:0.72em;line-height:1.35;color:var(--ink-2, #555);">`
             + `${esc(text)}</p>`;
    }

    function zeitraumText(variante) {
        const de = isDe();
        const z = _majorZeitraum;
        /* BEFUND B2 (07.09.2026): HIER STAND „Win %". Die Kachel daneben
           rechnet S/(S+N+U) aus win_rate_numeric — das ist
           MIT_UNENTSCHIEDEN, nicht die Matchpunkte-Konvention, fuer die
           js/win-rate-konvention.js den Namen „Win %" freihaelt
           (Betreiberanordnung 05.09.2026). Der Kurzname kommt aus dem
           Modul, damit hier keine zweite Abschrift entsteht. */
        const WK = (typeof window !== 'undefined') ? window.WinRateKonvention : null;
        /* KEIN ABGESCHRIEBENER NAME — UND EINE OFFENE SPANNUNG.
           tests/unit/test-sprache-win-rate.js haelt seit dem 20.08.2026
           fest, dass in DIESER Datei kein zweites deutsches Wort fuer die
           Quote im Quelltext steht ("Ja auf jeden Fall win rate").
           js/win-rate-konvention.js fuehrt seit dem 07.09.2026 aber genau
           so ein Wort als Kurznamen — es MUSS eines geben, seit „Win %"
           den Matchpunkten vorbehalten ist.

           Beides geht nur so: der Name wird nirgends abgeschrieben,
           sondern zur Laufzeit aus dem Modul geholt. Faellt das Modul
           aus, steht die FORMEL da — die ist kein vierter Name und nie
           falsch. Dass der Name im ANGEZEIGTEN Text auftaucht, ist eine
           Entscheidung des Betreibers vom 05.09.2026 und gehoert ihm,
           nicht dieser Datei. */
        const quoteName = (WK && WK.kurz('mitUnentschieden'))
            || ((WK && WK.hol('mitUnentschieden') && WK.hol('mitUnentschieden').formel)
                || 'S / (S + N + U)');
        const online = de
            ? `Anteil, ${quoteName} und Top-8-Quote: data/limitless_online_decks.csv und `
              + 'data/online_tournament_top8_decks.csv — Gesamtstand des Onlinefeldes, '
              + 'ohne Turnierdatum je Zeile.'
            : `Share, ${quoteName} and top-8 rate: data/limitless_online_decks.csv and `
              + 'data/online_tournament_top8_decks.csv — cumulative online field, '
              + 'no per-row tournament date.';
        let major;
        if (z && z.von && z.bis) {
            const spanne = (z.von === z.bis)
                ? (de ? `vom ${z.von}` : `on ${z.von}`)
                : (de ? `vom ${z.von} bis ${z.bis}` : `from ${z.von} to ${z.bis}`);
            major = de
                ? `Major-Zahlen und Day 2: data/labs_tournament_decks_${z.key}.csv — `
                  + `${z.turniere} ${z.turniere === 1 ? 'Turnier' : 'Turniere'} ${spanne}.`
                : `Major figures and day 2: data/labs_tournament_decks_${z.key}.csv — `
                  + `${z.turniere} ${z.turniere === 1 ? 'event' : 'events'} ${spanne}.`;
        } else {
            major = de
                ? 'Für dieses Format liegt kein Präsenzturnier-Auszug vor.'
                : 'No in-person event extract for this format.';
        }
        const fenster = (variante === 'embed')
            ? (de
                ? ' Das Datenfenster „Daten ab“ über der Kartenübersicht wirkt auf diese vier Kacheln nicht — '
                  + 'die zugrunde liegenden Dateien führen kein Datum je Zeile.'
                : ' The “data from” window above the card overview does not affect these four tiles — '
                  + 'the underlying files carry no per-row date.')
            : '';
        return (de ? 'Zeitraum: ' : 'Period: ') + online + ' ' + major + fenster;
    }

    // Four quantised steps, not a ramp: at every step the text colour is
    // chosen for that exact background, so the number stays readable.
    // A thin row (< 20 games) is capped at the faintest step instead of
    // fading the whole row — dimming the row would take the deck name
    // with it, and the name is the one thing you still need to read.
    function shadeFor(delta, thin) {
        const a = Math.abs(delta);
        let step = a < 2.5 ? 0 : a < 7.5 ? 1 : a < 15 ? 2 : 3;
        if (thin) step = Math.min(step, 1);
        if (step === 0) return '';
        return `arc-mu-${delta >= 0 ? 'up' : 'down'}-${step}`;
    }

    // Der Balken unter der Quote. Er laeuft aus der Mitte der Zelle
    // heraus — nach rechts ueber 50 %, nach links darunter — und ist
    // damit ohne jede Farbwahrnehmung lesbar. Die Toenung sagt dasselbe
    // ein zweites Mal, aber niemand muss sie sehen koennen.
    //
    // Die Skala endet bei 25 Punkten Abstand: nach der Glaettung (k=20)
    // liegt die aeusserste Zelle bei 24,4 bzw. 75,0 %, ein Balken, der
    // erst bei 50 Punkten voll waere, bliebe ueberall halb leer.
    const BAR_FULL_AT = 25;

    function barFor(delta) {
        if (delta == null || !isFinite(delta)) return { cls: '', pct: 0 };
        const pct = Math.min(1, Math.abs(delta) / BAR_FULL_AT) * 50;
        if (pct < 0.5) return { cls: '', pct: 0 };
        return { cls: delta >= 0 ? 'arc-mu-wr-up' : 'arc-mu-wr-down', pct };
    }

    /** Bilanz als "8–1–0", mit "?" fuer jedes fehlende Glied. */
    function praesenzBilanz(m) {
        return [
            m.majorSiege == null ? '?' : m.majorSiege,
            m.majorNiederlagen == null ? '?' : m.majorNiederlagen,
            m.majorUnentschieden == null ? '?' : m.majorUnentschieden,
        ].join('–');
    }

    /**
     * Die Praesenz-Paarung einer Zeile: was in der Zelle steht und warum.
     *
     * Getrennt vom HTML, damit die Entscheidung ausgefuehrt geprueft
     * werden kann statt am Quelltext.
     *
     * Vier Ausgaenge:
     *   'fehlt'        keine Praesenzpartien fuer diese Paarung
     *   'ohne-bilanz'  Partien da, aber keine Siege/Niederlagen in der Quelle
     *   'unter-schwelle' Partien da, aber weniger als MIN_PRAESENZ_PARTIEN:
     *                  ROHBILANZ und Fallzahl statt eines Prozentwerts
     *   'quote'        genug Partien: die Quote, wie bisher
     *
     * @returns {{art: string, inhalt: string, titel: string}}
     */
    function praesenzZelle(m, de) {
        const n = m.majorAnzahl;
        if (n == null) {
            return {
                art: 'fehlt',
                inhalt: '–',
                titel: L('arc.muMajorFehlt', de
                    ? 'Keine Präsenzpartien für diese Paarung.'
                    : 'No in-person games for this pairing.'),
            };
        }
        const bilanz = praesenzBilanz(m);
        /* Die Quelle bucht jede Spiegelpartie fuer BEIDE Seiten: gemessen
           am 07.09.2026 stimmt in data/labs_tournament_matchups_TEF-PBL.csv
           in 15 Zeilen — allen Spiegelpaarungen — `vs_count` nicht mit
           Siegen + Niederlagen + Unentschieden ueberein (Basic Box gegen
           sich selbst: 24 Partien, Bilanz 24-24-0). Wo die beiden Zahlen
           auseinandergehen, steht das jetzt dabei, statt dass der Leser
           es fuer einen Tippfehler haelt. */
        const summe = (m.majorSiege == null || m.majorNiederlagen == null
            || m.majorUnentschieden == null)
            ? null
            : (m.majorSiege + m.majorNiederlagen + m.majorUnentschieden);
        const spiegelSatz = (summe != null && summe !== n)
            ? (de
                ? ` Die Quelle zählt hier ${summe} Einzelergebnisse auf ${n} Partien — jede Spiegelpartie ist für beide Seiten verbucht.`
                : ` The source books ${summe} results on ${n} games — each mirror game is counted for both sides.`)
            : '';

        if (!m.majorBilanzDa) {
            return {
                art: 'ohne-bilanz',
                inhalt: '–',
                titel: mitQuote(L('arc.muMajorOhneBilanz', de
                    ? '{n} Präsenzpartien, aber ohne Bilanz in der Quelle — ohne Siege und Niederlagen lässt sich keine {quote} ({formel}) bilden. Deshalb steht hier ein Strich statt einer geschätzten Zahl.'
                    : '{n} in-person games, but the source row carries no record — without wins and losses there is no {quote} ({formel}) to show. Hence the dash instead of an estimate.'), 'ohneUnentschieden')
                    .replace('{n}', String(n)) + spiegelSatz,
            };
        }

        if (n < MIN_PRAESENZ_PARTIEN) {
            /* MINDESTSTICHPROBE. Kein Prozentwert, sondern das, was
               wirklich gezaehlt wurde. Siehe MIN_PRAESENZ_PARTIEN. */
            return {
                art: 'unter-schwelle',
                inhalt: esc(bilanz),
                titel: (de
                    ? `Bilanz ${bilanz} (S–N–U) aus ${n} Präsenzpartien. Unter ${MIN_PRAESENZ_PARTIEN} Partien steht hier kein Prozentwert: `
                      + `bei ${n} Partien verschiebt eine einzige Partie die Quote um ${fmt(100 / n)} Punkte. `
                      + `Die Bilanz sagt dasselbe, ohne eine Genauigkeit zu behaupten, die die Stichprobe nicht trägt.`
                    : `Record ${bilanz} (W–L–T) from ${n} in-person games. Below ${MIN_PRAESENZ_PARTIEN} games no percentage is shown: `
                      + `at ${n} games a single game moves the rate by ${fmt(100 / n)} points. `
                      + `The record says the same without claiming a precision the sample cannot carry.`)
                    + spiegelSatz,
            };
        }

        if (m.majorWr == null) {
            /* Bilanz da, Partien genug — und trotzdem keine Quote: alle
               Partien unentschieden. S/(S+N) hat dann keinen Nenner. */
            return {
                art: 'nur-remis',
                inhalt: '–',
                titel: mitQuote(L('arc.muMajorNurRemis', de
                    ? '{n} Präsenzpartien, alle unentschieden ({b}). Die {quote} ({formel}) zählt Siege gegen entschiedene Partien — entschieden ist hier keine. Ein Wert stünde für nichts.'
                    : '{n} in-person games, all drawn ({b}). The {quote} ({formel}) counts wins against decided games — none here were decided. A number would stand for nothing.'), 'ohneUnentschieden')
                    .replace('{n}', String(n)).replace('{b}', bilanz) + spiegelSatz,
            };
        }

        return {
            art: 'quote',
            inhalt: esc(fmt(m.majorWr)) + ' %',
            titel: L('arc.muMajorTip', de
                ? '{w} aus {n} Präsenzpartien (Bilanz {b}). Dieselbe Rechnung wie die Spalte links: Siege ÷ entschiedene Partien, mit demselben Ausgleich für dünne Paarungen. Roh {r} %.'
                : '{w} from {n} in-person games (record {b}). Same calculation as the column on the left: wins ÷ decided games, with the same allowance for thin pairings. Raw {r} %.')
                .replace('{w}', fmt(m.majorWr) + ' %')
                .replace('{n}', String(n))
                .replace('{b}', bilanz)
                .replace('{r}', fmt(m.majorWrRoh)) + spiegelSatz,
        };
    }

    /** Die beiden Praesenzspalten einer Zeile als HTML. */
    function praesenzZellen(m, de) {
        const z = praesenzZelle(m, de);
        const duenn = (m.majorAnzahl != null && m.majorAnzahl < MIN_PRAESENZ_PARTIEN);
        return `<td class="arc-mu-major${duenn ? ' arc-mu-major-duenn' : ''}${
                z.art === 'unter-schwelle' ? ' arc-mu-major-bilanz' : ''
            }" title="${esc(z.titel)}">${z.inhalt}</td>`
            + `<td class="arc-mu-major-n${duenn ? ' arc-mu-n-low' : ''}">${
                m.majorAnzahl == null ? '–' : m.majorAnzahl}</td>`;
    }

    /* Die Kuerzel-Legende unter der Matchup-Tabelle.
     *
     * SIE STEHT SEIT DEM 11.09.2026 NUR NOCH IN DER DECK-ANALYSE unter
     * der Tabelle; in der Tier-Liste wandert sie hinter den Info-Knopf
     * des Abschnitts. Gemeldet: „und wenn man das aufgeklappt hat, auch
     * da unten den Text weg, dann lieber irgendwie neben Tier eins oder
     * generell irgendwie neben Tierliste den Info-Button hinmachen, der
     * dann alle Erklaerungssachen irgendwie dahinschreibt. Weil es ist
     * sonst irgendwann zu viel Text, und zu viel Text verwirrt die
     * Leute."
     *
     * Der Text ist derselbe geblieben — er steht nur noch EINMAL statt
     * unter jeder der 29 aufgeklappten Tabellen. Die Hausregel aus
     * tests/unit/test-sprache-win-rate.js bleibt gewahrt: ein Kuerzel
     * ist erlaubt, WENN eine Legende es aufloest. Sie loest es weiterhin
     * auf, nur an einer Stelle, die man einmal liest statt neunundzwanzig
     * Mal ueberspringt.
     */
    function legendeText(hatMajor) {
        const de = isDe();
        return hatMajor
            ? mitQuote(L('arc.muLegende', de
                ? 'WR = {quote} ({formel}) · M = Matches · W/L/T = Siege / Niederlagen / Unentschieden · Major-WR = dieselbe Rechnung auf Präsenzturnieren, Major-Matches die Partien dahinter'
                : 'WR = {quote} ({formel}) · M = matches · W/L/T = wins / losses / ties · Major-WR = the same calculation at in-person events, Major matches the games behind it'), 'ohneUnentschieden')
            /* Ohne Praesenzdaten sagt EIN Satz, was zwei leere
               Spalten nicht gesagt haetten: dass es sie gibt und
               dass hier keine anfallen. */
            : mitQuote(L('arc.muLegendeOhneMajor', de
                ? 'WR = {quote} ({formel}) · M = Matches · W/L/T = Siege / Niederlagen / Unentschieden. Präsenzturniere sind hier nicht dabei — für dieses Deck liegen in diesem Format keine vor.'
                : 'WR = {quote} ({formel}) · M = matches · W/L/T = wins / losses / ties. In-person events are not included — there are none for this deck in this format.'), 'ohneUnentschieden');
    }

    function legendeHtml(hatMajor, variante) {
        /* NUR NOCH IM UEBERLAGERUNGSFENSTER.
           In der Tier-Liste (inline) steht der Abschnitt „Tier-Liste"
           mit seinem Info-Knopf darueber — dort wandert die Legende hin
           (erklaerungHtml() weiter unten meldet sie).
           Das Ueberlagerungsfenster, das die Trending-Kacheln oeffnen,
           hat keinen solchen Knopf: es ist ein Fenster ueber der Seite,
           nicht ein Abschnitt darin. Dort bliebe die Legende sonst
           ersatzlos weg, und „WR" stuende unaufgeloest da — genau das
           verbietet tests/unit/test-sprache-win-rate.js. */
        if (variante === 'inline') return '';
        return `<p class="arc-mu-legende">${esc(legendeText(hatMajor))}</p>`;
    }

    function matchupTableHtml(name, opts) {
        const de = isDe();
        const collapsed = !!(opts && opts.collapsible);
        const preview = (opts && opts.preview) || 0;
        const variante = (opts && opts.variante) || 'overlay';
        const all = matchupsFor(name);
        if (!all.length) {
            return `<p class="arc-empty">${esc(L('arc.noMatchups', de
                ? 'Für dieses Deck liegen keine Matchup-Daten vor.'
                : 'No matchup data for this deck.'))}</p>`;
        }
        const rows = (preview && all.length > preview) ? vorschauAuswahl(all, preview) : all;
        /* ── Eine Spalte ohne Zahlen ist keine Spalte ────────────────
         *
         * Der Betreiber am 02.09.2026, vor drei Spalten voller Striche:
         * "Wenn die Zahlen da leer sind brauchen wir die Spalten denn
         * ueberhaupt?"
         *
         * Major-P und Major-M stehen leer, wenn es fuer dieses Deck in
         * diesem Format keine Praesenzpartien gibt — bei den heutigen
         * Daten also fuer JEDE Zeile. Zwei Spalten Striche kosten
         * waagerechten Platz, lassen die Tabelle unvollstaendig
         * aussehen und sagen nichts, was ein Satz nicht besser sagt.
         *
         * Fehlt die Zahl nur in EINZELNEN Zeilen, bleiben beide
         * Spalten stehen: dann traegt der Strich eine Aussage
         * ("dieses Paar gab es dort nicht"), und die Nachbarzeilen
         * zeigen, wogegen. Weg ist die Spalte nur, wenn sie in KEINER
         * Zeile etwas zu sagen hat. */
        /* BEFUND DER ABNAHME (03.09.2026): das stand auf `rows`, also
           auf der bei preview:8 gekuerzten Liste. Ein Deck, dessen
           erste acht Matchups keine Praesenzdaten haben, waehrend
           Zeile 9 welche hat, bekam den Satz "fuer dieses Deck liegen
           in diesem Format keine vor" — und zeigte in der
           aufgeklappten Vollansicht die Spalten. Zwei Aussagen, ein
           Deck. Die Frage gilt dem DECK, also `all`. */
        const hatMajor = all.some(m => m.majorWr != null || m.majorAnzahl != null);
        const body = rows.map(m => {
            const shade = shadeFor(m.winRate - 50, m.thin);
            const bar = barFor(m.winRate - 50);
            return `<tr>
                    <td class="arc-mu-opp">${esc(m.opponent)}</td>
                    <td class="arc-mu-wr ${shade} ${bar.cls}" style="--arc-bar:${
                        fmt(bar.pct, 1).replace(',', '.')}%" title="${esc(
                        (de ? 'Geglättet aus ' : 'Smoothed from ')
                        + (m.wins == null ? '?' : m.wins) + '–' + (m.losses == null ? '?' : m.losses)
                        + '–' + (m.ties == null ? '?' : m.ties)
                        + (de ? ' (roh ' : ' (raw ') + fmt(m.winRateRoh) + ' %'
                        + (de ? '; Unentschieden zählen nicht mit)' : '; ties are left out)'))
                    }">${esc(fmt(m.winRate))} %</td>
                    <td class="arc-mu-n${m.thin ? ' arc-mu-n-low' : ''}">${m.games}</td>
                    <td class="arc-mu-w">${m.wins == null ? '–' : m.wins}</td>
                    <td class="arc-mu-l">${m.losses == null ? '–' : m.losses}</td>
                    <td class="arc-mu-u">${m.ties == null ? '–' : m.ties}</td>
                    ${!hatMajor ? '' : praesenzZellen(m, de)}
                </tr>`;
        }).join('');
        const thinCount = rows.filter(m => m.thin).length;
        const note = thinCount
            ? `<p class="arc-mu-note">${esc(L('arc.thinNote', de
                ? 'Blasse Zeilen: unter {n} Matches — die Quote ist dort kaum aussagekräftig.'
                : 'Faded rows: fewer than {n} games — the rate says little there.')
                .replace('{n}', String(THIN_GAMES)))}</p>`
            : '';
        /* DIE SCHWELLE STEHT DA, WO SIE WIRKT. Ohne diesen Satz muesste
           ein Leser raten, warum in einer Zeile "8–1–0" und in der
           naechsten "45,5 %" steht. Er erscheint nur, wenn die Spalte
           ueberhaupt da ist und mindestens eine Zeile darunter liegt —
           sonst waere er Laerm. Begruendung: siehe MIN_PRAESENZ_PARTIEN. */
        const unterSchwelle = hatMajor
            ? rows.filter(m => m.majorAnzahl != null && m.majorBilanzDa
                && m.majorAnzahl < MIN_PRAESENZ_PARTIEN).length
            : 0;
        const praesenzNote = unterSchwelle
            /* KEIN i18n-Schluessel: js/i18n.js gehoert einem anderen
               Arbeitspaket. Zweisprachig inline ueber getLang(), wie es
               das Projekt an Dutzenden Stellen macht. */
            ? `<p class="arc-mu-note arc-mu-note-praesenz">${esc((de
                ? 'Major-WR: erst ab {n} Präsenzpartien als Prozentwert. Darunter steht die Bilanz (S–N–U) '
                  + 'und daneben die Partienzahl — bei {n} Partien verschiebt eine einzige Partie die Quote '
                  + 'schon um {p} Punkte, darunter entsprechend mehr. Betroffen hier: {k} von {g} Zeilen.'
                : 'Major WR: shown as a percentage only from {n} in-person games. Below that you get the record (W–L–T) '
                  + 'next to the game count — at {n} games a single game already moves the rate by {p} points, '
                  + 'and more below. Affected here: {k} of {g} rows.')
                .replace(/\{n\}/g, String(MIN_PRAESENZ_PARTIEN))
                .replace('{p}', fmt(100 / MIN_PRAESENZ_PARTIEN))
                .replace('{k}', String(unterSchwelle))
                .replace('{g}', String(rows.length)))}</p>`
            : '';

        const table = `
            <div class="mobile-table-scroll">
                <table class="arc-mu-table">
                    <thead><tr>
                        <th>${esc(L('arc.colOpponent', de ? 'Gegner-Deck' : 'Deck'))}</th>
                        <!-- „WR" ist eine Kurzform und darf nur dastehen,
                             solange der Hinweis den vollen Namen UND die
                             Formel nennt. quotenHinweis() setzt beides
                             zusammen; ohne ihn waere „WR" ein Hausname. -->
                        <th title="${esc(quotenHinweis('ohneUnentschieden'))}"
                            data-quote-konvention="ohneUnentschieden">${esc(L('arc.colWinRate', 'WR'))}</th>
                        <th title="${esc(L('arc.colGames', de ? 'gespielte Matches' : 'games played'))}">${
                            esc(L('arc.colGamesKurz', 'M'))}</th>
                        <th title="${esc(de ? 'gewonnene Matches' : 'games won')}">W</th>
                        <th title="${esc(de ? 'verlorene Matches' : 'games lost')}">L</th>
                        <!-- T, nicht U. Gemeldet am 01.09.2026: "wenn man bei
                             der Tierliste die Matchups aufklappt, dann auf
                             jeden Fall Win-Loss-Tie nutzen und nicht
                             Win-Loss-Unentschieden." W und L standen schon
                             englisch da; ein deutsches U dazwischen war ein
                             Bruch mitten in einer dreispaltigen Bilanz. Die
                             Szene sagt ohnehin Tie. -->
                        <th title="${esc(mitQuote(de
                            ? 'Unentschieden (Tie) — sie zählen in der {quote} ({formel}) dieser Tabelle nicht mit'
                            : 'ties — they do not count in this table\'s {quote} ({formel})', 'ohneUnentschieden'))}">T</th>
                        <!-- DIE PRAESENZSPALTE HEISST JETZT AUCH WR, WEIL SIE
                             DASSELBE RECHNET. Bis zum 03.09.2026 hiess sie
                             "Major-P": sie zeigte die Matchpunktquote
                             (3S+U)/(3M) der Labs-Datei, weil je Paarung keine
                             Bilanz vorlag und sich ohne die Unentschieden
                             nichts umrechnen liess. Zwei Spalten mit
                             demselben Namen und zwei Rechnungen waeren der
                             Fehler gewesen, den diese Seite seit Wochen
                             abarbeitet — also trug sie einen eigenen Namen.

                             Der Betreiber wollte einen Namen: "das sollten
                             wir auch WR nennen, damit wir hier ueberall
                             Gleiches benutzen". Der richtige Weg dorthin war
                             nicht, die Beschriftung zu aendern, sondern die
                             Zahl: der Scraper holt seit PR #639 die Bilanz je
                             Paarung mit, und die Spalte rechnet nun S/(S+N)
                             mit demselben 20-Partien-Prior wie links. Gleicher
                             Name, gleiche Rechnung.

                             "Major-Matches" statt "Major-M": ausgeschrieben,
                             wo Platz ist. WR bleibt abgekuerzt, weil es in
                             der Szene der stehende Begriff ist. -->
                        ${!hatMajor ? '' : `                        <th title="${esc(quotenHinweis('ohneUnentschieden') + '  ' + L('arc.colMajorTip', de
                            ? 'Präsenzturniere: Siege ÷ entschiedene Partien (Unentschieden bleiben außen vor) — dieselbe Rechnung und dieselbe Glättung wie die WR-Spalte links, nur auf den Präsenzturnieren statt online.'
                            : 'In-person events: wins ÷ decided games (ties left out) — the same calculation and the same smoothing as the WR column on the left, just measured at in-person events instead of online.'))}"
                            data-quote-konvention="ohneUnentschieden">${
                            esc(L('arc.colMajor', 'Major-WR'))}</th>
                        <th title="${esc(L('arc.colMajorN', de
                            ? 'Präsenzpartien dieser Paarung'
                            : 'in-person games for this pairing'))}">${
                            esc(L('arc.colMajorNKurz', de ? 'Major-Matches' : 'Major matches'))}</th>`}
                    </tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            ${legendeHtml(hatMajor, variante)}${note}${praesenzNote}`;
        if (!collapsed) return table;
        // Closed by default inline: the tiles are the scroll content, the
        // table is a reference you open when you need it. Otherwise a
        // dozen decks with 19 opponents each is 25 000 px of page.
        return `<details class="arc-mu-details">
                <summary class="arc-mu-summary">${esc(
                    L('arc.matchupsToggle', de ? 'Matchups anzeigen ({n})' : 'Show matchups ({n})')
                        .replace('{n}', String(all.length)))}</summary>
                ${table}
            </details>`;
    }

    // One renderer, three shapes. Two implementations of "the card" would
    // drift apart the moment either is touched.
    //   overlay  full card in a modal (kept as an API for other views)
    //   inline   full card stacked in the tier list, matchup table closed
    //   embed    header + tiles only, above the full matchup analysis,
    //            where the heatmap already covers the matchups
    function render(name, variant) {
        const de = isDe();
        const v = variant || 'overlay';
        const icons = (window.ArchetypeIcons && typeof window.ArchetypeIcons.getIconHtml === 'function')
            ? window.ArchetypeIcons.getIconHtml(name, { size: 'md', layout: 'inline', alt: '' })
            : '';
        const close = v === 'overlay'
            ? `<button type="button" class="arc-close"
                       aria-label="${esc(L('arc.close', de ? 'Schließen' : 'Close'))}">×</button>` : '';
        // Der Bildexport gehoert an den Kopf, nicht in eine Aktionsleiste
        // am Fuss: in der eingebetteten Variante gibt es keine Leiste, und
        // genau dort — in der Deck-Analyse — will man das Bild.
        const shareBtn = `<button type="button" class="arc-share" data-deck="${esc(name)}"
                    title="${esc(L('arc.shareImageTip', de
                        ? 'Analyse als Bild speichern oder teilen (1200 × 675)'
                        : 'Save or share this analysis as an image (1200 × 675)'))}"
                    aria-label="${esc(L('arc.shareImageTip', de
                        ? 'Analyse als Bild speichern oder teilen'
                        : 'Save or share this analysis as an image'))}">
                    <span aria-hidden="true">▧</span> ${esc(L('arc.shareImage', de ? 'Bild' : 'Image'))}
                </button>`;
        const head = `
            <div class="arc-head">
                <span class="arc-name">${esc(name)}</span>
                <span class="arc-icons">${icons}</span>
                ${shareBtn}
            </div>`;
        if (v === 'embed') {
            return `${head}${tilesHtml(name, v)}`;
        }
        const matchups = (v === 'inline')
            ? matchupTableHtml(name, { collapsible: true, preview: MU_VORSCHAU, variante: 'inline' })
            : `<h4 class="arc-mu-title">${esc(L('arc.matchupTitle', de ? 'Matchups' : 'Matchups'))}</h4>`
              + matchupTableHtml(name, { variante: v });
        // One row of actions, not two: separate rows for "all matchups"
        // and "full analysis" cost 108 px of a 595 px card on a phone.
        const total = matchupsFor(name).length;
        const moreBtn = (v === 'inline' && total > MU_VORSCHAU)
            ? `<button type="button" class="arc-mu-more" data-deck="${esc(name)}">${
                esc(L('arc.showAll', de ? 'Alle {n}' : 'All {n}').replace('{n}', String(total)))
              }</button>` : '';
        /* ── DER WEG IN DEN META CALL, AN EINEM KONKRETEN DECK ──────────
           BESTELLT (Betreiber, 11.09.2026): „sinnvoller waere in der Tier
           List je Deck einen Button archetype vs the Meta oder Deck vs
           Meta oder irgendwie sowas und dann springt man zum Meta Call
           zu dem Feature und das Deck ist dann schon ausgewaehlt."

           Vorher gab es dafuer einen eigenen Abschnitt im Reiter
           „Aktuelles Meta", der nach dem Umzug der Rechnung nur noch
           einen Verweis trug — ein leerer Block, an dem kein Deck hing.
           Hier haengt er an genau dem Deck, das man gerade ansieht.

           Der Knopf steht in der Aktionszeile und damit in der Karte der
           Tier-Liste (inline) und im Ueberlagerungsfenster (overlay), das
           die kompakten Kacheln des Trending-Blocks oeffnen. Die
           eingebettete Variante der Deck-Analyse hat keine Aktionszeile;
           dort steht die Heatmap ohnehin daneben. */
        const metaBtn = `<button type="button" class="arc-meta" data-deck="${esc(name)}"
                    title="${esc(L('arc.gotoMetaCallTip', de
                        ? 'Im Meta Call öffnen — dort wird jede Paarung dieses Decks mit dem Anteil gewichtet, den du für dein nächstes Turnier erwartest'
                        : 'Open in the Meta Call — there every pairing of this deck is weighted by the share you expect at your next tournament'))}">
                    ${esc(L('arc.gotoMetaCall', de
                        ? 'Gegen das Meta →' : 'Vs. the meta →'))}
                </button>`;
        const goto = `<div class="arc-actions">${moreBtn}${metaBtn}<button type="button" class="arc-goto" data-deck="${esc(name)}">
                    ${esc(L('arc.gotoAnalysis', de
                        ? 'Volle Analyse →' : 'Full analysis →'))}
                </button></div>`;
        const attrs = v === 'overlay'
            ? ` role="dialog" aria-modal="true" aria-label="${esc(name)}"` : '';
        return `<div class="arc-card arc-card--${v}"${attrs}>
                ${close}${head}${tilesHtml(name, v)}${matchups}${goto}
            </div>`;
    }

    function cardHtml(name) { return render(name, 'overlay'); }

    // ── inline cards in the tier list ───────────────────────────────

    // The tier list renders placeholders synchronously and calls this
    // once; the card data loads independently of the tier ranking, so
    // blocking the list on it would delay everything for one panel.
    function fillInline(root) {
        const host = root || document;
        const slots = host.querySelectorAll ? host.querySelectorAll('.arc-inline[data-deck]') : [];
        if (!slots.length) return Promise.resolve(0);
        return load().then(() => {
            slots.forEach(el => {
                const name = el.getAttribute('data-deck');
                if (name) el.innerHTML = render(name, 'inline');
            });
            return slots.length;
        });
    }

    // Everything inside an inline card that is not a control navigates to
    // the full analysis — the whole card is the click target, exactly as
    // the compact banner card was.
    document.addEventListener('click', (e) => {
        const share = e.target.closest && e.target.closest('.arc-share');
        if (share) {
            e.stopPropagation();
            e.preventDefault();
            const deck = share.getAttribute('data-deck');
            if (deck && window.DsShare) window.DsShare.shareDeckCard(deck);
            return;
        }
        /* Vor .arc-goto pruefen: beide sitzen in derselben Zeile, und
           die Karte darunter faengt jeden Klick ab, der nicht vorher
           gestoppt wird. */
        const meta = e.target.closest && e.target.closest('.arc-meta');
        if (meta) {
            e.stopPropagation();
            e.preventDefault();
            const deck = meta.getAttribute('data-deck');
            if (deck && window.MetaCall && typeof window.MetaCall.oeffneMitDeck === 'function') {
                window.MetaCall.oeffneMitDeck(deck);
            } else if (typeof window.switchTabAndUpdateMenu === 'function') {
                /* Ohne das Modul wenigstens den Reiter — ein Knopf, der
                   gar nichts tut, ist schlimmer als einer, der einen
                   Schritt weniger schafft. */
                window.switchTabAndUpdateMenu('meta-call');
            }
            return;
        }
        const more = e.target.closest && e.target.closest('.arc-mu-more');
        if (more) {
            e.stopPropagation();
            const slot = more.closest('.arc-inline');
            const name = more.getAttribute('data-deck');
            if (slot && name) slot.innerHTML = render(name, 'overlay').replace('arc-card--overlay', 'arc-card--inline');
            return;
        }
        // The disclosure triangle must not navigate.
        if (e.target.closest && e.target.closest('.arc-mu-summary')) { e.stopPropagation(); return; }
        const card = e.target.closest && e.target.closest('.arc-inline .arc-card');
        if (card) {
            const name = card.parentElement && card.parentElement.getAttribute('data-deck');
            if (name && typeof navigateToCurrentMetaWithDeck === 'function') {
                navigateToCurrentMetaWithDeck(name);
            }
        }
    });

    // ── overlay ─────────────────────────────────────────────────────

    function overlayEl() {
        let ov = document.getElementById('archetypeCardOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'archetypeCardOverlay';
            ov.className = 'arc-overlay';
            ov.hidden = true;
            document.body.appendChild(ov);
            ov.addEventListener('click', (e) => {
                if (e.target === ov || e.target.closest('.arc-close')) { close(); return; }
                const goto = e.target.closest('.arc-goto');
                if (goto) {
                    const deck = goto.getAttribute('data-deck');
                    close();
                    if (typeof navigateToCurrentMetaWithDeck === 'function') {
                        navigateToCurrentMetaWithDeck(deck);
                    }
                }
            });
        }
        return ov;
    }

    function close() {
        const ov = document.getElementById('archetypeCardOverlay');
        if (ov) { ov.hidden = true; ov.innerHTML = ''; }
        document.body.classList.remove('arc-open');
        if (window.HintergrundSperre) window.HintergrundSperre.freigeben('archetyp-karte');
        _openDeck = null;
    }

    function open(name) {
        if (!name) return;
        _openDeck = name;
        const ov = overlayEl();
        ov.hidden = false;
        document.body.classList.add('arc-open');
        if (window.HintergrundSperre) window.HintergrundSperre.sperren('archetyp-karte');
        ov.innerHTML = `<div class="arc-card"><p class="arc-empty">${esc(
            L('arc.loading', isDe() ? 'Lade …' : 'Loading …'))}</p></div>`;
        load().then(() => {
            if (_openDeck !== name) return;      // a different deck was opened meanwhile
            ov.innerHTML = cardHtml(name);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _openDeck) close();
    });

    // Dynamically rendered markup does not re-render itself on a language
    // switch — the overlay has to redraw its own contents.
    document.addEventListener('languageChanged', () => {
        if (_openDeck) {
            const ov = document.getElementById('archetypeCardOverlay');
            if (ov && !ov.hidden) ov.innerHTML = cardHtml(_openDeck);
        }
    });

    // Die Zahlen hinter den drei Kacheln, ohne HTML drumherum.
    // js/ds-share.js malt daraus die teilbare Bildkarte; ohne diesen
    // Zugang müsste es beide CSVs ein zweites Mal lesen und die
    // Glättung nachbauen — zwei Quellen für dieselbe Zahl, und die
    // Bildkarte würde irgendwann etwas anderes behaupten als die
    // Kachel daneben.
    function factsFor(name) {
        const d = _decks ? (_decks[findKey(_decks, name)] || null) : null;
        const m = _major ? (_major[findKey(_major, name)] || null) : null;
        const c = _conv ? _conv.decks.find(x =>
            String(x.name).toLowerCase() === String(name).toLowerCase()) : null;
        return {
            name,
            share:   d ? d.share : NaN,
            winRate: d ? d.winRate : NaN,
            count:   d ? d.count : NaN,
            /* Die Online-Partien. Die Kachel auf der Seite zeigt sie
               seit dem 02.09.2026 neben der Quote; das Bild trug sie
               bis zum 11.09.2026 nicht — dort stand an der Stelle
               "+3,30 ggue. 50 %", eine Zahl, die man der Quote daneben
               ansieht. Gemeldet: "dieses Plus drei Komma drei gegenueber
               fuenfzig Prozent, das kann da auch weg … dann haben wir
               hier in dem Bild extrem viel Freiraum. Den Freiraum
               sollten wir dann auch vielleicht nutzen, um einmal zu
               zeigen Matches online, Winrate online und dann Matches
               Major und Winrate Major." */
            partien: d ? d.partien : NaN,
            perfPct: c ? c.perfPct : NaN,
            rawPct:  c ? c.rawPct : NaN,
            top8:    c ? c.top8 : NaN,
            brought: c ? c.brought : NaN,
            thin:    c ? !!c.thin : false,
            expected:     _conv ? _conv.expected : NaN,
            totalBrought: _conv ? _conv.totalBrought : NaN,
            thinGames: THIN_GAMES,
            /* DIE PRAESENZSEITE FUERS BILD (02.09.2026).
               Gemeldet: "im generiertem Bild fehlen die Daten voellig."
               Zu Recht — die Karte trug seit dem 01.09. vier Kacheln mit
               online UND Major, das Bild daneben nur die drei alten Zahlen.
               Und das Bild ist die Fassung, die die Seite VERLAESST. */
            majorShare:    m ? m.share : NaN,
            majorWinRate:  m && m.winRate != null ? m.winRate : NaN,
            majorPartien:  m ? m.partien : NaN,
            majorAntritte: m ? m.antritte : NaN,
            majorRemis:    m && m.remisQuote != null ? m.remisQuote : NaN,
            /* DIESELBE SCHRANKE WIE DIE KACHEL. Ohne sie druckte das
               Bild eine harte Prozentzahl, wo die Seite "zu wenige
               Antritte" sagt — gemessen bei 26 von 44 Decks. Das Bild
               ist die Fassung, die die Seite VERLAESST; es darf ihr
               nicht widersprechen. */
            majorDay2:     (m && m.day2Quote != null && m.day1 >= DAY2_MIN_ANTRITTE)
                               ? m.day2Quote : NaN,
            majorDay2Antritte: m ? m.day1 : NaN,
            majorDay2MinAntritte: DAY2_MIN_ANTRITTE,
            majorDay2Feld: _majorFeld().day2Quote,
            majorDuennAb:  MAJOR_DUENN_PARTIEN,
            /* Leer, solange der Praesenzauszug im laufenden Format
               liegt; sonst dessen Formatschluessel. Das Bild verlaesst
               die Seite — wenn dort Major-Zahlen aus einem anderen
               Kartenpool stehen, muss das AUF dem Bild stehen und nicht
               nur daneben auf der Seite. */
            majorFormat: majorFormatFremd(),
        };
    }

    /* ── ALLES, WAS FRUEHER UNTER JEDER KARTE STAND ──────────────────
     *
     * Der Zeitraumsatz und die Kuerzel-Legende beschreiben das FORMAT,
     * nicht das Deck: sie standen wortgleich unter jeder der 29 Karten.
     * Seit dem 11.09.2026 stehen sie einmal hinter dem Info-Knopf des
     * Abschnitts „Tier-Liste". Gemeldet: „dann lieber irgendwie neben
     * Tier eins oder generell irgendwie neben Tierliste den Info-Button
     * hinmachen, der dann alle Erklaerungssachen irgendwie dahinschreibt.
     * Weil es ist sonst irgendwann zu viel Text, und zu viel Text
     * verwirrt die Leute."
     *
     * GEMELDET, NICHT KOPIERT: die Saetze tragen Zahlen aus dem
     * laufenden Datenstand (Turnierzahl, Zeitraum, Formatschluessel) und
     * den Quotennamen aus js/win-rate-konvention.js. Eine Abschrift in
     * js/ds-abschnitt-info.js waere beim naechsten Datenlauf falsch.
     *
     * js/app-tier-meta.js haengt das Ergebnis an seine eigene Meldung an
     * — melde() ERSETZT, zwei Melder auf derselben Kennung wuerden sich
     * gegenseitig loeschen.
     */
    window.getArchetypeErklaerung = function () {
        const de = isDe();
        const hatMajor = Object.keys(_major || {}).length > 0;
        const fremd = majorFormatFremd();
        let html = '';
        if (fremd) {
            /* Der Hinweis steht VORN, nicht in einer Fussnote: er
               aendert, wie man jede Major-Zahl auf der Seite liest. */
            html += '<p><strong>' + esc(de
                ? 'Die Präsenzzahlen stammen aus einem anderen Format: ' + fremd + '.'
                : 'The in-person figures come from a different format: ' + fremd + '.')
                + '</strong> ' + esc(de
                ? 'Online läuft bereits das aktuelle Format. Major-Anteil, Major-WR und Day-2-Quote vergleichen deshalb zwei verschiedene Kartenpools — dort steht der Formatschlüssel jeweils daneben.'
                : 'Online already runs the current format. Major share, major WR and the day-2 rate therefore compare two different card pools — the format key is shown next to each of them.')
                + '</p>';
        }
        html += '<p>' + esc(zeitraumText()) + '</p>';
        html += '<p>' + esc(legendeText(hatMajor)) + '</p>';
        html += '<p>' + esc(de
            ? 'Die zugeklappte Karte zeigt ' + MU_VORSCHAU + ' Paarungen: je zur Hälfte die mit den meisten Begegnungen über und unter 50 %, danach nach Quote sortiert. Nicht die besten und schlechtesten — eine Paarung, die man zweimal trifft, zählt für die Vorbereitung weniger als eine, die ständig kommt. „Alle" zeigt die vollständige Liste.'
            : 'The collapsed card shows ' + MU_VORSCHAU + ' pairings: half of them the most-played above 50 %, half the most-played below, then sorted by rate. Not the best and worst — a pairing you meet twice matters less for preparation than one you meet constantly. “All” shows the full list.')
            + '</p>';
        return html;
    };

    window.getArchetypeFacts = function (name) {
        return load().then(() => factsFor(name));
    };
    /* Dieselbe Auswahlregel fuer das Bild (js/ds-share.js).
       Eine zweite Fassung dort waere die naechste Stelle, die
       auseinanderlaeuft — das Bild ist die Fassung, die die Seite
       VERLAESST, und darf ihr nicht widersprechen. */
    window.getArchetypeMatchupAuswahl = function (alle, wieViele) {
        return vorschauAuswahl(alle, wieViele);
    };
    window.getArchetypeMatchups = function (name) {
        return load().then(() => matchupsFor(name));
    };
    /* Die Feldanteile, so wie diese Datei sie ohnehin schon geparst hat.
       Sie entstand fuer js/ds-ev-rechner.js, damit dieselbe CSV nicht ein
       zweites Mal geparst wird — zwei Parser fuer eine Datei sind zwei
       Zahlen fuer eine Sache, sobald einer angefasst wird.

       DER AUFRUFER IST AM 11.09.2026 ENTFALLEN. Die Rechnung liegt im
       Meta Call und arbeitet dort mit dem ERWARTETEN Feld
       (buildField()), nicht mit dem gemessenen. Die Funktion bleibt
       trotzdem stehen: sie ist die einzige Stelle, an der die
       Feldanteile ohne einen zweiten Parser zu haben sind, und sie
       kostet nichts, solange niemand sie ruft. Wer sie wieder braucht,
       soll sie vorfinden statt sie nachzubauen. */
    window.getArchetypeShares = function () {
        return load().then(() => {
            const out = {};
            Object.keys(_decks || {}).forEach(k => {
                out[k] = { share: _decks[k].share, count: _decks[k].count, winRate: _decks[k].winRate };
            });
            return out;
        });
    };

    window.openArchetypeCard = open;
    window.closeArchetypeCard = close;
    window.renderInlineArchetypeCards = fillInline;
    window.renderArchetypeCardInto = function (el, name) {
        if (!el || !name) return Promise.resolve(false);
        return load().then(() => { el.innerHTML = render(name, 'embed'); return true; });
    };
    // Exposed for tests; not part of the page's own API surface.
    window._archetypeCardInternals = {
        matchupsFor, parseSemicolonCsv, findKey, THIN_GAMES, factsFor,
        // Fuer ausgefuehrte Zusicherungen: die Mindeststichprobe und die
        // Entscheidung, die an ihr haengt (07.09.2026).
        MIN_PRAESENZ_PARTIEN, praesenzZelle, praesenzZellen,
        setData: (decks, conv) => { _decks = decks; _conv = conv; },
        cardHtml, tilesHtml, matchupTableHtml, render, toneFor, shadeFor, barFor,
        /* Befund B1 (07.09.2026): die Grundgesamtheit des Online-Anteils.
           Nach aussen gegeben, damit eine Zusicherung sie AUSFUEHREN und
           gegen die Datei nachrechnen kann, statt den Quelltext zu lesen. */
        onlineFeld: _onlineFeld,
    };
})();
