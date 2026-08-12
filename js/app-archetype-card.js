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
            return {
                opponent: m.opponent_deck,
                winRate: Number(m.win_rate_numeric) || 0,
                wins: Number.isFinite(parts[0]) ? parts[0] : null,
                losses: Number.isFinite(parts[1]) ? parts[1] : null,
                games,
                thin: games < THIN_GAMES,
            };
        }).sort((a, b) => b.winRate - a.winRate);
    }

    // ── rendering ───────────────────────────────────────────────────

    // The colour sits on a thin top edge, never as a fill: the number
    // stays in normal text colour so its contrast is guaranteed whatever
    // the value is.
    function tile(edge, label, value, context, titleAttr) {
        const ttl = titleAttr ? ` title="${esc(titleAttr)}"` : '';
        return `<div class="arc-tile arc-tile--${edge}"${ttl}>
                <div class="arc-tile-label">${esc(label)}</div>
                <div class="arc-tile-value">${value}</div>
                <div class="arc-tile-ctx">${context}</div>
            </div>`;
    }

    function tilesHtml(name) {
        const de = isDe();
        const d = _decks[findKey(_decks, name)] || null;
        const rep = d
            ? tile('rep', L('arc.repLabel', de ? 'Feldanteil' : 'Representation'),
                `${esc(fmt(d.share))} %`,
                esc(L('arc.repCtx', de ? '{n} Listen im Feld' : '{n} lists in the field')
                    .replace('{n}', fmt(d.count, 0))))
            : tile('rep', L('arc.repLabel', de ? 'Feldanteil' : 'Representation'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));
        const wr = d
            ? tile('wr', L('arc.wrLabel', de ? 'Siegquote' : 'Win Rate'),
                `${esc(fmt(d.winRate, 2))} %`,
                esc((d.winRate >= 50 ? '+' : '−') + fmt(Math.abs(d.winRate - 50), 2) + ' '
                    + L('arc.wrCtx', de ? 'gegenüber 50 %' : 'vs 50%')))
            : tile('wr', L('arc.wrLabel', de ? 'Siegquote' : 'Win Rate'), '–',
                esc(L('arc.noData', de ? 'keine Daten' : 'no data')));

        // The conversion file covers fewer decks than the deck list —
        // 111 of 127. A silent 0 would read as "never converts", which is
        // the opposite of "we have no tournament data for this deck".
        const c = _conv ? _conv.decks.find(x =>
            String(x.name).toLowerCase() === String(name).toLowerCase()) : null;
        const conv = c
            ? tile('conv', L('arc.convLabel', de ? 'Top-8 vs. Erwartung' : 'Top-8 vs. expected'),
                `${c.perfPct >= 0 ? '+' : '−'}${esc(fmt(Math.abs(c.perfPct), 1))} %`,
                esc(`${fmt(c.top8, 0)} / ${fmt(c.brought, 0)} → ${fmt((c.top8 / c.brought) * 100, 2)} % `
                    + L('arc.convCtx', de ? 'Cut-Quote' : 'cut rate')),
                c.thin ? L('arc.convThin', de
                    ? 'Kleine Stichprobe — der Wert ist zum Feld-Durchschnitt hin geglättet.'
                    : 'Small sample — the value is smoothed toward the field average.') : '')
            : tile('conv', L('arc.convLabel', de ? 'Top-8 vs. Erwartung' : 'Top-8 vs. expected'),
                '–',
                esc(L('arc.convMissing', de ? 'zu wenig Daten' : 'not enough data')),
                L('arc.convMissingTip', de
                    ? 'Dieses Deck fehlt in der Top-Cut-Datei. Das heißt nicht, dass es nie konvertiert — die Siegquote stammt aus einer anderen Quelle.'
                    : 'This deck is absent from the top-cut file. That does not mean it never converts — the win rate comes from a different source.'));
        return `<div class="arc-tiles">${rep}${wr}${conv}</div>`;
    }

    function matchupTableHtml(name) {
        const de = isDe();
        const rows = matchupsFor(name);
        if (!rows.length) {
            return `<p class="arc-empty">${esc(L('arc.noMatchups', de
                ? 'Für dieses Deck liegen keine Matchup-Daten vor.'
                : 'No matchup data for this deck.'))}</p>`;
        }
        const body = rows.map(m => {
            // Blue above 50, red below, grey at the line. Not green/red:
            // that is the most common colour-blindness pairing, and it is
            // the one weakness of the graphics this view is modelled on.
            const delta = m.winRate - 50;
            const strength = Math.min(Math.abs(delta) / 25, 1) * (m.thin ? 0.35 : 1);
            const rgb = delta >= 0 ? '37, 99, 235' : '220, 38, 38';
            const bg = Math.abs(delta) < 0.05
                ? 'transparent'
                : `rgba(${rgb}, ${(0.06 + strength * 0.28).toFixed(3)})`;
            return `<tr class="${m.thin ? 'arc-mu-thin' : ''}">
                    <td class="arc-mu-opp">${esc(m.opponent)}</td>
                    <td class="arc-mu-wr" style="background:${bg}">${esc(fmt(m.winRate))} %</td>
                    <td class="arc-mu-n">${m.games}</td>
                    <td class="arc-mu-w">${m.wins == null ? '–' : m.wins}</td>
                    <td class="arc-mu-l">${m.losses == null ? '–' : m.losses}</td>
                </tr>`;
        }).join('');
        const thinCount = rows.filter(m => m.thin).length;
        const note = thinCount
            ? `<p class="arc-mu-note">${esc(L('arc.thinNote', de
                ? 'Blasse Zeilen: unter {n} Spielen — die Quote ist dort kaum aussagekräftig.'
                : 'Faded rows: fewer than {n} games — the rate says little there.')
                .replace('{n}', String(THIN_GAMES)))}</p>`
            : '';
        return `
            <table class="arc-mu-table">
                <thead><tr>
                    <th>${esc(L('arc.colOpponent', de ? 'Gegner-Deck' : 'Deck'))}</th>
                    <th>${esc(L('arc.colWinRate', de ? 'Siegquote' : 'Win Rate'))}</th>
                    <th title="${esc(L('arc.colGames', de ? 'Spiele' : 'Games'))}">Σ</th>
                    <th>W</th><th>L</th>
                </tr></thead>
                <tbody>${body}</tbody>
            </table>${note}`;
    }

    function cardHtml(name) {
        const de = isDe();
        const icons = (window.ArchetypeIcons && typeof window.ArchetypeIcons.getIconHtml === 'function')
            ? window.ArchetypeIcons.getIconHtml(name, { size: 'md', layout: 'inline', alt: '' })
            : '';
        return `
            <div class="arc-card" role="dialog" aria-modal="true" aria-label="${esc(name)}">
                <button type="button" class="arc-close"
                        aria-label="${esc(L('arc.close', de ? 'Schließen' : 'Close'))}">×</button>
                <div class="arc-head">
                    <span class="arc-name">${esc(name)}</span>
                    <span class="arc-icons">${icons}</span>
                </div>
                ${tilesHtml(name)}
                <h4 class="arc-mu-title">${esc(L('arc.matchupTitle', de ? 'Matchups' : 'Matchups'))}</h4>
                ${matchupTableHtml(name)}
                <button type="button" class="arc-goto" data-deck="${esc(name)}">
                    ${esc(L('arc.gotoAnalysis', de
                        ? 'Zur vollen Matchup-Analyse →' : 'Full matchup analysis →'))}
                </button>
            </div>`;
    }

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

    window.openArchetypeCard = open;
    window.closeArchetypeCard = close;
    // Exposed for tests; not part of the page's own API surface.
    window._archetypeCardInternals = {
        matchupsFor, parseSemicolonCsv, findKey, THIN_GAMES,
        setData: (decks, conv) => { _decks = decks; _conv = conv; },
        cardHtml, tilesHtml, matchupTableHtml,
    };
})();
