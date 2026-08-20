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

    // A matchup on fewer games than this says very little — 8 wins in 12
    // games reads as 66 % and means almost nothing. Same threshold and
    // the same treatment as the heatmap's `heatmap-td-n-low`.
    const THIN_GAMES = 20;

    let _decks = null;          // deck_name -> { share, winRate, count }
    let _conv = null;           // computeConversionPerformance() result
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

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ── data ────────────────────────────────────────────────────────

    function parseSemicolonCsv(text) {
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
        if (!lines.length) return [];
        const head = lines[0].split(';');
        return lines.slice(1).map(line => {
            const cells = line.split(';');
            const row = {};
            head.forEach((h, i) => { row[h] = cells[i]; });
            return row;
        });
    }

    function load() {
        if (_decks && _conv) return Promise.resolve(true);
        if (_loading) return _loading;
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : 'data/';
        const stamp = `?t=${Date.now()}`;
        _loading = Promise.all([
            fetch(base + DECKS_URL + stamp).then(r => r.ok ? r.text() : ''),
            fetch(base + TOP8_URL + stamp).then(r => r.ok ? r.text() : ''),
        ]).then(([decksTxt, top8Txt]) => {
            _decks = {};
            for (const r of parseSemicolonCsv(decksTxt)) {
                if (!r.deck_name) continue;
                _decks[r.deck_name.trim()] = {
                    share: num(r.share_numeric),
                    winRate: num(r.win_rate_numeric),
                    count: num(r.count),
                };
            }
            const rows = parseSemicolonCsv(top8Txt);
            _conv = (rows.length && typeof window.computeConversionPerformance === 'function')
                ? window.computeConversionPerformance(rows) : null;
            return true;
        }).catch(() => { _decks = _decks || {}; _conv = null; return false; });
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
        const ttl = titleAttr ? ` title="${esc(titleAttr)}"` : '';
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
        return `<div class="arc-tile arc-tile--${role} arc-tone--${tone}"${ttl}>
                <div class="arc-tile-value">${arw}${value}</div>
                <div class="arc-tile-label">${esc(label)}</div>
                <div class="arc-tile-ctx">${context}</div>
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

        // Share carries no good/bad direction — it is neutral by nature.
        const rep = d
            ? tile('rep', 'neutral', L('arc.repLabel', de ? 'Anteil' : 'Share'),
                `${esc(fmt(d.share))} %`,
                esc(L('arc.repCtx', de ? '{n} Listen im Feld' : '{n} lists in the field')
                    .replace('{n}', fmt(d.count, 0))))
            : tile('rep', 'tie', L('arc.repLabel', de ? 'Anteil' : 'Share'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));

        const wrDelta = d ? d.winRate - 50 : null;
        const wr = d
            ? tile('wr', toneFor(wrDelta), L('arc.wrLabel', 'Win Rate'),
                `${esc(fmt(d.winRate))} %`,
                esc((wrDelta >= 0 ? '+' : '−') + fmt(Math.abs(wrDelta), 2) + ' '
                    + L('arc.wrCtx', de ? 'gegenüber 50 %' : 'vs 50%')),
                '', arrow(wrDelta))
            : tile('wr', 'tie', L('arc.wrLabel', 'Win Rate'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));

        // The conversion file covers fewer decks than the deck list —
        // 111 of 127. A silent 0 would read as "never converts", which is
        // the opposite of "we have no tournament data for this deck".
        const c = _conv ? _conv.decks.find(x =>
            String(x.name).toLowerCase() === String(name).toLowerCase()) : null;
        const conv = c
            ? tile('conv', toneFor(c.perfPct), L('arc.convLabel', de ? 'Top-8 vs. Erw.' : 'Top-8 vs. exp.'),
                `${c.perfPct >= 0 ? '+' : '−'}${esc(fmt(Math.abs(c.perfPct)))} %`,
                esc(`${fmt(c.top8, 0)} / ${fmt(c.brought, 0)} → ${fmt((c.top8 / c.brought) * 100, 2)} % `
                    + L('arc.convCtx', de ? 'Cut-Quote' : 'cut rate')),
                c.thin ? L('arc.convThin', de
                    ? 'Kleine Stichprobe — der Wert ist zum Feld-Durchschnitt hin geglättet.'
                    : 'Small sample — the value is smoothed toward the field average.') : '',
                arrow(c.perfPct))
            : tile('conv', 'tie', L('arc.convLabel', de ? 'Top-8 vs. Erw.' : 'Top-8 vs. exp.'),
                '–',
                esc(L('arc.convMissing', de ? 'zu wenig Daten' : 'not enough data')),
                L('arc.convMissingTip', de
                    ? 'Dieses Deck fehlt in der Top-Cut-Datei. Das heißt nicht, dass es nie konvertiert — die Win Rate stammt aus einer anderen Quelle.'
                    : 'This deck is absent from the top-cut file. That does not mean it never converts — the win rate comes from a different source.'));
        return `<div class="arc-tiles">${rep}${wr}${conv}</div>`;
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
                ? 'Blasse Zeilen: unter {n} Spielen — die Quote ist dort kaum aussagekräftig.'
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
                        <th title="${esc(L('arc.colGames', de ? 'gespielte Partien' : 'games played'))}">${
                            esc(de ? 'Partien' : 'Games')}</th>
                        <th title="${esc(de ? 'gewonnene Partien' : 'games won')}">W</th>
                        <th title="${esc(de ? 'verlorene Partien' : 'games lost')}">L</th>
                        <th title="${esc(de ? 'unentschiedene Partien — sie zählen in der Win Rate dieser Tabelle nicht mit'
                                            : 'ties — they do not count in this table\'s win rate')}">U</th>
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
