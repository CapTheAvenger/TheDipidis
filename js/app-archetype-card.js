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

    let _decks = null;          // deck_name -> { share, winRate, count }
    let _conv = null;           // computeConversionPerformance() result
    let _major = null;          // deck_name -> { share, winRate, ... } | {} wenn kein Major
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
                return fetch(`${base}labs_tournament_decks_${key}.csv${stamp}`)
                    .then(r => r.ok ? r.text() : '');
            })
            .then(txt => {
                const raus = {};
                if (!txt) return raus;
                for (const r of parseCsv(txt, ',')) {
                    const name = String(r.deck_name || '').trim();
                    if (!name) continue;
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
        if (_decks && _conv && _major) return Promise.resolve(true);
        if (_loading) return _loading;
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : 'data/';
        const stamp = `?t=${Date.now()}`;
        _loading = Promise.all([
            fetch(base + DECKS_URL + stamp).then(r => r.ok ? r.text() : ''),
            fetch(base + TOP8_URL + stamp).then(r => r.ok ? r.text() : ''),
            _majorLaden(base, stamp),
        ]).then(([decksTxt, top8Txt, major]) => {
            _major = major || {};
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
            _conv = (rows.length && typeof window.computeConversionPerformance === 'function')
                ? window.computeConversionPerformance(rows) : null;
            return true;
        }).catch(() => { _decks = _decks || {}; _conv = null; _major = _major || {}; return false; });
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
            };
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

    function tileGeteilt(role, tone, label, onlineWert, majorWert, majorLeer, majorQuelle, majorDuenn, tip, pfeil) {
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
        const halb = (wert, quelle, schwach, duenn) =>
            `<div class="arc-halb${schwach ? ' arc-halb--leer' : ''}${
                duenn ? ' arc-halb--duenn' : ''}">
                <span class="arc-halb-quelle">${esc(quelle)}</span>
                <span class="arc-tile-value">${wert}</span>
            </div>`;
        return `<div class="arc-tile arc-tile--${role} arc-tile--geteilt arc-tone--${tone}${
                hat ? ' arc-tile--hinweis' : ''}"${ttl}>
                <div class="arc-tile-label">${esc(label)}</div>
                <div class="arc-halbe">
                    ${halb(arw + onlineWert, L('arc.quelleOnline', 'online'), false)}
                    ${halb(majorWert || '–',
                        majorWert
                            ? (majorQuelle || L('arc.quelleMajor', 'Major'))
                            : esc(majorLeer || L('arc.quelleMajor', 'Major')),
                        !majorWert, majorWert && majorDuenn)}
                </div>
            </div>`;
    }

    function tilesHtml(name) {
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

        const rep = d
            ? tileGeteilt('rep', 'neutral', L('arc.repLabel', de ? 'Anteil' : 'Share'),
                `${esc(fmt(d.share))} %`,
                m ? `${esc(fmt(m.share))} %` : '',
                majorLeer,
                /* Der Anteil ruht auf ANTRITTEN, nicht auf Partien: "1 von
                   774" ist auch bei einem Antritt eine belastbare Aussage.
                   Deshalb keine Partienzahl und keine Daempfung. */
                m ? L('arc.quelleMajorA', de ? 'Major · {n} Antritte' : 'major · {n} entries')
                        .replace('{n}', fmtGanz(m.antritte)) : null,
                false,
                L('arc.repTip2', de
                    ? '{n} Listen im Meta online. {mj}'
                    : '{n} lists in the online field. {mj}')
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
            ? tileGeteilt('wr', toneFor(wrDelta), L('arc.wrLabel', 'Win Rate'),
                `${esc(fmt(d.winRate))} %`,
                wrMajor,
                majorLeer,
                /* Die Partienzahl steht MIT auf der Zeile, nicht nur im
                   Hinweis: sie ist die Zahl, an der man entscheidet, ob man
                   der Quote glaubt, und ein Hinweis erscheint erst beim
                   Verweilen — auf dem Telefon also nie. */
                m && m.partien > 0
                    ? L('arc.quelleMajorN', de ? 'Major · {n} Partien' : 'major · {n} games')
                        .replace('{n}', fmtGanz(m.partien))
                    : null,
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
                    ? 'Siege geteilt durch alle Partien, auf beiden Seiten gleich gerechnet. Online aus {n} Partien. {mj}'
                    : 'Wins divided by all games, same on both sides. Online from {n} games. {mj}')
                    .replace('{n}', fmtGanz(d.partien))
                    .replace('{mj}', (m && m.partien > 0)
                        ? L('arc.wrTipMajor', de
                            ? 'Major aus {p} Partien, davon {u} % unentschieden — online sind es 1,3 %. Unentschieden zählen auf beiden Seiten nicht als Sieg, drücken die Major-Spalte also spürbar. Bei dieser Partienzahl liegt der Wert auf ±{k} Punkte genau.'
                            : 'Major from {p} games, {u} % of them ties — online it is 1.3 %. Ties count as non-wins on both sides, so they push the major column down. At this sample the value is accurate to ±{k} points.')
                            .replace('{p}', fmtGanz(m.partien))
                            .replace('{u}', fmt(m.remisQuote))
                            .replace('{k}', fmt(wrKi, 0))
                        : L('arc.wrTipOhne', de
                            ? 'Noch keine Präsenzpartien für dieses Deck in diesem Format.'
                            : 'No in-person games for this deck in this format yet.')),
                arrow(wrDelta))
            : tile('wr', 'tie', L('arc.wrLabel', 'Win Rate'), '–',
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
                L('arc.convTip2', de
                    ? '{t} von {b} gewichteten Antritten auf Turnieren mit Top-8-Schnitt.'
                    : '{t} of {b} weighted entries at events with a top-8 cut.')
                    .replace('{t}', fmtGewichtet(c.top8))
                    .replace('{b}', fmtGewichtet(c.brought))
                + (c.thin ? ' ' + L('arc.convThin2', de
                    ? 'Kleine Stichprobe — die Quote steht auf wenigen Antritten und schwankt stark.'
                    : 'Small sample — the rate rests on few entries and swings hard.') : ''),
                arrow(c.perfPct))
            : tile('conv', 'tie', L('arc.convLabel3', de ? 'Top-8-Quote (online)' : 'Top-8 rate (online)'),
                '–',
                esc(L('arc.convMissing', de ? 'zu wenig Daten' : 'not enough data')),
                L('arc.convMissingTip', de
                    ? 'Dieses Deck fehlt in der Top-Cut-Datei. Das heißt nicht, dass es nie konvertiert — die Win Rate stammt aus einer anderen Quelle.'
                    : 'This deck is absent from the top-cut file. That does not mean it never converts — the win rate comes from a different source.'));
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
        const d2 = (m && m.day2Quote != null && m.day1 >= 5)
            ? tile('day2', toneFor(feld.day2Quote != null ? m.day2Quote - feld.day2Quote : 0),
                L('arc.day2Label', de ? 'Day-2-Quote (Major)' : 'Day 2 rate (major)'),
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
                L('arc.day2Label', de ? 'Day-2-Quote (Major)' : 'Day 2 rate (major)'),
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

        return `<div class="arc-tiles arc-tiles--vier">${rep}${wr}${conv}${d2}</div>`;
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

    function matchupTableHtml(name, opts) {
        const de = isDe();
        const collapsed = !!(opts && opts.collapsible);
        const preview = (opts && opts.preview) || 0;
        const all = matchupsFor(name);
        if (!all.length) {
            return `<p class="arc-empty">${esc(L('arc.noMatchups', de
                ? 'Für dieses Deck liegen keine Matchup-Daten vor.'
                : 'No matchup data for this deck.'))}</p>`;
        }
        const rows = (preview && all.length > preview) ? all.slice(0, preview) : all;
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
                </tr>`;
        }).join('');
        const thinCount = rows.filter(m => m.thin).length;
        const note = thinCount
            ? `<p class="arc-mu-note">${esc(L('arc.thinNote', de
                ? 'Blasse Zeilen: unter {n} Matches — die Quote ist dort kaum aussagekräftig.'
                : 'Faded rows: fewer than {n} games — the rate says little there.')
                .replace('{n}', String(THIN_GAMES)))}</p>`
            : '';

        const table = `
            <div class="mobile-table-scroll">
                <table class="arc-mu-table">
                    <thead><tr>
                        <th>${esc(L('arc.colOpponent', de ? 'Gegner-Deck' : 'Deck'))}</th>
                        <th title="${esc(window.WinRateKonvention
                            ? window.WinRateKonvention.hinweis('ohneUnentschieden')
                            : '')}">${esc(L('arc.colWinRate', 'Win Rate'))}</th>
                        <th title="${esc(L('arc.colGames', de ? 'gespielte Matches' : 'games played'))}">${
                            esc(de ? 'Matches' : 'Games')}</th>
                        <th title="${esc(de ? 'gewonnene Matches' : 'games won')}">W</th>
                        <th title="${esc(de ? 'verlorene Matches' : 'games lost')}">L</th>
                        <!-- T, nicht U. Gemeldet am 01.09.2026: "wenn man bei
                             der Tierliste die Matchups aufklappt, dann auf
                             jeden Fall Win-Loss-Tie nutzen und nicht
                             Win-Loss-Unentschieden." W und L standen schon
                             englisch da; ein deutsches U dazwischen war ein
                             Bruch mitten in einer dreispaltigen Bilanz. Die
                             Szene sagt ohnehin Tie. -->
                        <th title="${esc(de ? 'Unentschieden (Tie) — sie zählen in der Win Rate dieser Tabelle nicht mit'
                                            : 'ties — they do not count in this table\'s win rate')}">T</th>
                    </tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>${note}`;
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
            return `${head}${tilesHtml(name)}`;
        }
        const matchups = (v === 'inline')
            ? matchupTableHtml(name, { collapsible: true, preview: 8 })
            : `<h4 class="arc-mu-title">${esc(L('arc.matchupTitle', de ? 'Matchups' : 'Matchups'))}</h4>`
              + matchupTableHtml(name);
        // One row of actions, not two: separate rows for "all matchups"
        // and "full analysis" cost 108 px of a 595 px card on a phone.
        const total = matchupsFor(name).length;
        const moreBtn = (v === 'inline' && total > 8)
            ? `<button type="button" class="arc-mu-more" data-deck="${esc(name)}">${
                esc(L('arc.showAll', de ? 'Alle {n}' : 'All {n}').replace('{n}', String(total)))
              }</button>` : '';
        const goto = `<div class="arc-actions">${moreBtn}<button type="button" class="arc-goto" data-deck="${esc(name)}">
                    ${esc(L('arc.gotoAnalysis', de
                        ? 'Volle Analyse →' : 'Full analysis →'))}
                </button></div>`;
        const attrs = v === 'overlay'
            ? ` role="dialog" aria-modal="true" aria-label="${esc(name)}"` : '';
        return `<div class="arc-card arc-card--${v}"${attrs}>
                ${close}${head}${tilesHtml(name)}${matchups}${goto}
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
        _openDeck = null;
    }

    function open(name) {
        if (!name) return;
        _openDeck = name;
        const ov = overlayEl();
        ov.hidden = false;
        document.body.classList.add('arc-open');
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
            majorDay2:     m && m.day2Quote != null ? m.day2Quote : NaN,
            majorDay2Feld: _majorFeld().day2Quote,
            majorDuennAb:  MAJOR_DUENN_PARTIEN,
        };
    }

    window.getArchetypeFacts = function (name) {
        return load().then(() => factsFor(name));
    };
    window.getArchetypeMatchups = function (name) {
        return load().then(() => matchupsFor(name));
    };
    // Die Feldanteile, so wie diese Datei sie ohnehin schon geparst hat.
    // js/ds-ev-rechner.js braucht sie, um das Feld zu gewichten — und
    // holt sich dieselbe CSV NICHT ein zweites Mal: zwei Parser fuer eine
    // Datei sind zwei Zahlen fuer eine Sache, sobald einer angefasst wird.
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
        setData: (decks, conv) => { _decks = decks; _conv = conv; },
        cardHtml, tilesHtml, matchupTableHtml, render, toneFor, shadeFor, barFor,
    };
})();
