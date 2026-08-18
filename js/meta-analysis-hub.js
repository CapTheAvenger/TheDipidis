// Meta & Deck Analysis Hub
// Provides a unified entry point for the meta/deck-analysis sub-tabs.
// - Mode 1 (Entry State): tile grid, shown when the hub tab is opened from the top nav.
// - Mode 2 (Active State): selected sub-tab with persistent sub-nav at the top.

(function () {
    'use strict';

    // Meta Call lives inside the Profile top-level tab as a sub-section,
    // not as a standalone top-level tab. The `profileSubTab` field tells
    // enterSubTab() to first switch to Profile, then activate the
    // profile sub-tab via switchProfileTab(). All other tiles still
    // map 1:1 to a top-level tab via switchTab().
    const SUB_TABS = [
        { id: 'city-league',          tileKey: 'cityLeague' },
        { id: 'city-league-analysis', tileKey: 'cityLeagueAnalysis' },
        { id: 'current-meta',         tileKey: 'currentMeta' },
        { id: 'current-analysis',     tileKey: 'currentMetaAnalysis' },
        { id: 'past-meta',            tileKey: 'pastMeta' },
        // Block 7 hat Meta Call zu einem eigenen Tab gemacht, diese Zeile
        // blieb stehen: die Kachel schickte weiter ins Profil und damit
        // gegen die Anmeldewand — 900 px "Sign in to unlock all features"
        // statt 5.012 px gefuellte Feldtabelle. Meta Call braucht keine
        // Anmeldung, genau das war der Sinn von Block 7.
        { id: 'meta-call',            tileKey: 'metaCall', topTab: 'meta-call' }
    ];

    const SUB_NAV_HOST_ID = 'metaHubSubNavHost';

    function t(key, fallback) {
        if (typeof window.t === 'function') {
            const val = window.t(key);
            if (val && val !== key) return val;
        }
        return fallback;
    }

    function getTileBullets(tileKey) {
        // i18n returns either an array (preferred) or a comma-separated string;
        // fall back to English defaults if the key is missing.
        const fallbacks = {
            cityLeague: [
                'Aktuelle Meta-Verteilung aus japanischen Cardshop-Turnieren',
                'Wöchentliche Trends und Tier-Bewegungen',
                'Schnellster Frühindikator vor internationalen Major-Turnieren'
            ],
            cityLeagueAnalysis: [
                'Tiefenanalyse einzelner Decks aus der City League',
                'Karten-Verteilung, Standard-Listen und häufige Tech-Picks',
                'Matchup-Win-Rates aus japanischen Turnieren'
            ],
            currentMeta: [
                'Online-Turnier-Auswertung von play.limitlesstcg.com',
                'Top-8 / Top-16-Conversion pro Deck',
                'Globale Sicht, näher am EU/US-Wettbewerbsumfeld'
            ],
            currentMetaAnalysis: [
                'Tiefenanalyse globaler Online-Decks',
                'Karten-Listen, Hand-Stats und Win-Rates',
                'Detail-Sicht für Spieler, die international antreten'
            ],
            pastMeta: [
                'Historische Major-Turnier-Daten (Regionals, IC, Worlds)',
                'Ergebnisse vergangener Standard-Formate',
                'Lerne aus der Geschichte für zukünftige Meta-Calls'
            ],
            metaCall: [
                'Vorhersage der Meta-Verteilung für dein nächstes Turnier',
                'Eigene Schätzungen mit Online-Daten kombinieren',
                'Erwartete Begegnungen pro Runde inkl. Matchup-Übersicht'
            ]
        };
        const key = `metaHub.tile.${tileKey}.bullets`;
        if (typeof window.t === 'function') {
            const val = window.t(key);
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val !== key && val.includes('|')) {
                return val.split('|').map(s => s.trim()).filter(Boolean);
            }
        }
        return fallbacks[tileKey] || [];
    }


    // ── Ebene 1: die Antwort ────────────────────────────────────────
    //
    // Die Einstiegsseite zeigte sechs Kacheln Fließtext und keine
    // einzige Zahl. Wer wissen will "was ist gerade stark", musste erst
    // raten, welche Kachel er braucht. Hier steht die Antwort, bevor
    // irgendwo geklickt wird: die drei meistgespielten Decks mit
    // Anteil und Top-8-Quote, dazu ein Satz Klartext.
    //
    // Alles daraus stammt aus derselben Datei und demselben Rechenweg
    // wie das Current-Meta-Panel (window.computeConversionPerformance),
    // damit ein Deck auf der Startseite nicht anders dasteht als eine
    // Ebene tiefer.
    const ANSWER_HOST_ID = 'metaHubAnswer';
    let _answerRows = null;

    function fmtPct(v, digits) {
        return (typeof window.formatPercent === 'function')
            ? window.formatPercent(v, digits)
            : Number(v).toFixed(digits == null ? 1 : digits) + '%';
    }
    function fmtSigned(v, digits) {
        return (typeof window.formatPercentSigned === 'function')
            ? window.formatPercentSigned(v, digits)
            : (v >= 0 ? '+' : '') + Number(v).toFixed(digits == null ? 1 : digits) + '%';
    }
    function isDe() {
        return typeof window.getLang === 'function' ? window.getLang() === 'de' : true;
    }

    async function loadAnswerRows() {
        if (_answerRows) return _answerRows;
        if (typeof fetchAndParseCSV !== 'function') return null;
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : './data/';
        try {
            _answerRows = await fetchAndParseCSV(`${base}online_tournament_top8_decks.csv?t=${Date.now()}`);
        } catch (_e) {
            _answerRows = null;      // kein Platzhalter: der Block bleibt weg
        }
        return _answerRows;
    }

    function answerModel(rows) {
        if (!rows || !rows.length || typeof window.computeConversionPerformance !== 'function') return null;
        const conv = window.computeConversionPerformance(rows);
        if (!conv || !(conv.expected > 0)) return null;
        const num = (v) => (typeof window.parseLocaleNumber === 'function')
            ? window.parseLocaleNumber(v, 0) : (parseFloat(v) || 0);
        const totalBrought = rows.reduce((sum, r) => sum + num(r.total_brought_weighted), 0);
        if (!(totalBrought > 0)) return null;
        const byPerf = new Map(conv.decks.map(d => [d.name, d]));
        const top = rows
            .map(r => {
                const brought = num(r.total_brought_weighted);
                const d = byPerf.get(r.deck_name);
                return {
                    name: r.deck_name,
                    sharePct: (brought / totalBrought) * 100,
                    convPct: num(r.top8_conv_rate) * 100,
                    perfPct: d ? d.perfPct : null,
                    brought,
                };
            })
            .sort((a, b) => b.sharePct - a.sharePct);

        // Das Deck aus der Überschrift steht als ERSTE Kachel. Vorher waren die
        // Kacheln rein nach Anteil sortiert, während die Überschrift nach Erfolg
        // wählte — unter "Was ist gerade stark?" stand dann als erstes der
        // schwächste Performer, rot eingefasst. Headline und Kacheln
        // widersprachen sich sichtbar.
        // Bewusst inline statt als Helfer: answerModel wird in
        // tests/unit/test-design-depth.js isoliert per new Function() extrahiert
        // und muss deshalb ohne äußeren Gültigkeitsbereich laufen.
        // Mindeststichprobe fuer die Ueberschrift. Vorher reichte brought >= 20
        // plus "nicht duenn" (< CONV_THIN_N = 50), faktisch also 50 Antritte —
        // damit wurde Toxtricity Box mit 53 Antritten (8 Cuts) zum "staerksten
        // Deck" gekuert, bei einem 95-%-Intervall von rund +-10 Prozentpunkten.
        const HEADLINE_MIN_BROUGHT = 100;
        const headline = (conv.decks || [])
            .filter(d => !d.thin && d.brought >= HEADLINE_MIN_BROUGHT)
            .sort((a, b) => b.perfPct - a.perfPct)[0] || null;
        const ordered = headline
            ? [
                Object.assign(
                    top.find(d => d.name === headline.name) || {
                        name: headline.name,
                        sharePct: (headline.brought / totalBrought) * 100,
                        convPct: (headline.top8 / headline.brought) * 100,
                        perfPct: headline.perfPct,
                        brought: headline.brought,
                    },
                    { role: 'best' }
                ),
                ...top.filter(d => d.name !== headline.name).map(d => Object.assign({}, d, { role: 'played' })),
              ]
            : top.map(d => Object.assign({}, d, { role: 'played' }));

        // EINE Herleitung der Headline-Quote. Die Kachel liest sie unten aus
        // demselben `ordered[0]`, der Satz aus headlineConvPct — beide also
        // aus derselben Zahl statt aus zwei Rechenwegen.
        const headlineConvPct = ordered.length && ordered[0].role === 'best'
            ? ordered[0].convPct
            : (headline ? (headline.top8 / headline.brought) * 100 : 0);

        return { conv, top: ordered.slice(0, 3), headline, totalBrought, headlineConvPct };
    }

    // Ein Satz Klartext über dem Zahlenblock. Er nennt das Deck, das am
    // deutlichsten über dem Feld liegt — nicht das meistgespielte, denn
    // "am häufigsten" und "am erfolgreichsten" sind zwei verschiedene
    // Fragen, und die zweite ist die interessantere.
    function answerSentence(model) {
        const best = model.headline;
        if (!best) return '';
        const de = isDe();
        // Die Stichprobe steht im Satz. Eine Quote ohne n ist eine Behauptung,
        // mit n ist sie eine Aussage.
        const n = Math.round(best.brought).toLocaleString(de ? 'de-DE' : 'en-US');

        // Die Quote wird EINMAL hergeleitet und dann an Satz und Kachel
        // gereicht. Vorher rechnete dieser Satz best.top8/best.brought neu,
        // während die Kachel darunter die vorgerundete CSV-Spalte
        // top8_conv_rate las: derselbe Wert 11,8525 % wurde hier zu 11,9 und
        // dort zu 11,8, drei Zeilen auseinander. Kein Datenfehler — zwei
        // Herleitungen, die verschieden runden.
        const convPct = model.headlineConvPct;

        // Roh gegen roh. Der Satz mischte bisher die rohe Quote mit der
        // geglätteten Abweichung: 11,85 % / 6,6457 % sind +78 %, angezeigt
        // wurden die geglätteten +72 %. Beide Zahlen stimmen für sich, aber
        // wer nachrechnet, kommt nicht auf das Ergebnis und hält die Seite
        // für kaputt. Die Glättung steht jetzt daneben statt darin.
        const rawPerf = (convPct / (model.conv.expected * 100) - 1) * 100;
        const smoothed = de
            ? `geglättet ${fmtSigned(best.perfPct, 0)}`
            : `smoothed ${fmtSigned(best.perfPct, 0)}`;

        return de
            ? `<strong>${escapeHtml(best.name)}</strong> ist derzeit das erfolgreichste Deck: ${fmtPct(convPct)} von ${n} Antritten erreichen die Top 8 — ${fmtSigned(rawPerf, 0)} gegenüber dem Feld-Durchschnitt von ${fmtPct(model.conv.expected * 100, 2)} (${smoothed}).`
            : `<strong>${escapeHtml(best.name)}</strong> is the strongest deck right now: ${fmtPct(convPct)} of ${n} entries reach top 8 — ${fmtSigned(rawPerf, 0)} against the field average of ${fmtPct(model.conv.expected * 100, 2)} (${smoothed}).`;
    }

    function answerHtml(model) {
        const de = isDe();
        const stamp = (typeof localStorage !== 'undefined' && localStorage.getItem('lastScraperUpdate')) || '';
        let playedRank = 0;
        const tile = (d) => {
            const perf = d.perfPct == null ? '' : fmtSigned(d.perfPct, 0);
            const cls = d.perfPct == null ? '' : (d.perfPct >= 0 ? ' is-pos' : ' is-neg');
            // Jede Kachel sagt, WARUM sie hier steht. Ohne diese Zeile las sich
            // die Reihe als "die drei stärksten Decks", obwohl sie nach Anteil
            // sortiert ist — und die erste Kachel konnte der schwächste
            // Performer sein.
            //
            // Der Rang steht dazu: zwei Kacheln nebeneinander mit derselben
            // Beschriftung "Meistgespielt" lasen sich wie ein Fehler, obwohl
            // es Platz 1 und Platz 2 nach Anteil sind.
            let role;
            if (d.role === 'best') {
                role = de ? 'Erfolgreichstes Deck' : 'Most successful deck';
            } else {
                playedRank += 1;
                role = (de ? 'Meistgespielt · Rang ' : 'Most played · rank ') + playedRank;
            }
            // "ggü. Feld" ist der geglättete Wert (Empirical Bayes, K = 50).
            // Ohne das Wort rechnet niemand die Quote gegen den Feldschnitt
            // nach und kommt auf dasselbe Ergebnis.
            const perfLabel = de ? 'ggü. Feld, geglättet' : 'vs. field, smoothed';
            return `
                <div class="ds-stat${cls}">
                    <span class="ds-stat-role">${role}</span>
                    <span class="ds-stat-label">${escapeHtml(d.name)}</span>
                    <span class="ds-stat-value">${fmtPct(d.sharePct)}</span>
                    <span class="ds-stat-context">${de ? 'des Feldes' : 'of the field'} · n = ${
                        Math.round(d.brought).toLocaleString(de ? 'de-DE' : 'en-US')}<br>${
                        de ? 'Top-8-Quote' : 'top-8 rate'} ${fmtPct(d.convPct)}${
                        perf ? ` · ${perf} ${perfLabel}` : ''}</span>
                </div>`;
        };
        return `
            <section class="meta-hub-answer" aria-labelledby="metaHubAnswerTitle">
                <h3 class="ds-label" id="metaHubAnswerTitle">
                    ${de ? 'Was ist gerade stark?' : 'What is strong right now?'}
                    ${stamp ? `<span class="ds-label-note">${de ? 'Daten' : 'Data'}: ${escapeHtml(stamp)}</span>` : ''}
                </h3>
                <p class="meta-hub-answer-line">${answerSentence(model)}</p>
                <div class="ds-stat-row">${model.top.map(tile).join('')}</div>
                <p class="ds-note">${de
                    ? `Anteil = wie oft ein Deck gespielt wurde, gemessen an ${Math.round(model.totalBrought).toLocaleString('de-DE')} gewichteten Antritten. Top-8-Quote = wie oft es davon die Top 8 erreicht hat. Beides aus Limitless Online.`
                    : `Share = how often a deck was played, over ${Math.round(model.totalBrought).toLocaleString('en-US')} weighted entries. Top-8 rate = how often it reached top 8. Both from Limitless Online.`}</p>
            </section>`;
    }

    async function renderAnswer() {
        const host = document.getElementById(ANSWER_HOST_ID);
        if (!host) return;
        const rows = await loadAnswerRows();
        const model = answerModel(rows);
        // Kein Modell, kein Block: eine leere Kachelreihe mit Strichen
        // wäre schlechter als gar keine.
        host.innerHTML = model ? answerHtml(model) : '';
    }

    function renderTiles() {
        const grid = document.getElementById('metaHubTileGrid');
        if (!grid) return;

        const html = SUB_TABS.map(({ id, tileKey }) => {
            const titleKey = `metaHub.tile.${tileKey}.title`;
            const fallbackTitle = t(`tab.${tileKey}`, id);
            const title = t(titleKey, fallbackTitle);
            const bullets = getTileBullets(tileKey);
            const bulletsHtml = bullets
                .map(b => `<li>${escapeHtml(b)}</li>`)
                .join('');
            return `
                <button type="button" class="meta-hub-tile" data-sub-tab="${id}" aria-label="${escapeHtml(title)}">
                    <span class="meta-hub-tile-title">${escapeHtml(title)}</span>
                    <ul class="meta-hub-tile-bullets">${bulletsHtml}</ul>
                </button>
            `;
        }).join('');

        grid.innerHTML = html;

        grid.querySelectorAll('.meta-hub-tile').forEach(btn => {
            btn.addEventListener('click', () => {
                const subTabId = btn.getAttribute('data-sub-tab');
                if (subTabId) enterSubTab(subTabId);
            });
        });
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureSubNavHost(targetTabEl) {
        if (!targetTabEl) return null;
        let host = targetTabEl.querySelector(`#${SUB_NAV_HOST_ID}`);
        if (host) return host;
        host = document.createElement('div');
        host.id = SUB_NAV_HOST_ID;
        host.className = 'meta-hub-subnav-host';
        targetTabEl.insertBefore(host, targetTabEl.firstChild);
        return host;
    }

    function clearAllSubNavHosts() {
        document.querySelectorAll('.meta-hub-subnav-host').forEach(el => el.remove());
    }

    function buildSubNav(activeId) {
        const backLabel = t('metaHub.backToOverview', '← Übersicht');
        const items = SUB_TABS.map(({ id, tileKey }) => {
            const label = t(`metaHub.tile.${tileKey}.title`, t(`tab.${tileKey}`, id));
            const activeClass = id === activeId ? ' active' : '';
            return `<button type="button" class="meta-hub-subnav-btn${activeClass}" data-sub-tab="${id}">${escapeHtml(label)}</button>`;
        }).join('');
        return `
            <nav class="meta-hub-subnav" aria-label="Meta &amp; Deck Analysis sub-navigation">
                <button type="button" class="meta-hub-subnav-back" id="metaHubBackBtn">${escapeHtml(backLabel)}</button>
                <div class="meta-hub-subnav-items">${items}</div>
            </nav>
        `;
    }

    // Resolve the DOM container that should host the sub-nav for a given
    // sub-tab. For top-level tabs that's the tab element itself; for the
    // Meta Call entry, which lives inside the Profile sub-tab, it's the
    // profile-metacall container.
    function _hostElementFor(subTabId) {
        const def = SUB_TABS.find(s => s.id === subTabId);
        if (def && def.profileSubTab) {
            return document.getElementById('profile-' + def.profileSubTab);
        }
        return document.getElementById(subTabId);
    }

    function injectSubNav(subTabId) {
        clearAllSubNavHosts();
        const tabEl = _hostElementFor(subTabId);
        if (!tabEl) return;
        const host = ensureSubNavHost(tabEl);
        if (!host) return;
        host.innerHTML = buildSubNav(subTabId);

        host.querySelectorAll('.meta-hub-subnav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-sub-tab');
                if (targetId && targetId !== subTabId) enterSubTab(targetId);
            });
        });

        const backBtn = host.querySelector('#metaHubBackBtn');
        if (backBtn) backBtn.addEventListener('click', exitToHub);
    }

    function setSideMenuActive(tabId) {
        document.querySelectorAll('.menu-item.active').forEach(btn => btn.classList.remove('active'));
        const sideBtn = document.getElementById('menu-btn-' + tabId);
        if (sideBtn) sideBtn.classList.add('active');
    }

    function enterSubTab(subTabId) {
        const def = SUB_TABS.find(s => s.id === subTabId);
        if (!def) return;
        if (def.profileSubTab) {
            // Meta Call route: switch to Profile top-level tab, then
            // activate the profile sub-tab, then inject our sub-nav at
            // the top of the profile-metacall container.
            const topTab = def.topTab || 'profile';
            if (typeof window.switchTab === 'function') {
                window.switchTab(topTab);
            }
            if (typeof window.switchProfileTab === 'function') {
                window.switchProfileTab(def.profileSubTab);
            }
            injectSubNav(subTabId);
            setSideMenuActive(topTab);
            return;
        }
        if (typeof window.switchTab === 'function') {
            window.switchTab(subTabId);
        }
        // switchTab is hooked to call injectSubNav, but call here too to be safe.
        injectSubNav(subTabId);
        setSideMenuActive(subTabId);
    }

    function exitToHub() {
        clearAllSubNavHosts();
        if (typeof window.switchTab === 'function') {
            window.switchTab('meta-analysis-hub');
        }
        // The hub now HAS its own top-level entry, so highlight it instead of
        // leaving the menu with nothing selected — the "← Übersicht" buttons
        // route through switchTabAndUpdateMenu and do highlight it, and two
        // back-paths must not leave two different menu states.
        setSideMenuActive('meta-analysis-hub');
    }

    function isSubTab(tabId) {
        return SUB_TABS.some(s => s.id === tabId);
    }

    function onTabSwitched(tabId) {
        if (tabId === 'meta-analysis-hub') {
            clearAllSubNavHosts();
            renderTiles();
            return;
        }
        if (isSubTab(tabId)) {
            injectSubNav(tabId);
            return;
        }
        // Switched to an unrelated tab — clean up sub-nav.
        clearAllSubNavHosts();
    }

    function refreshLanguage() {
        renderAnswer();
        // Re-render tiles & any active sub-nav after a language switch.
        // For top-level sub-tabs, the host IS the .tab-content with
        // class 'active' when visible. For Meta Call, the host is
        // #profile-metacall which also carries 'active' when shown via
        // switchProfileTab. Either way, .active is the reliable marker.
        renderTiles();
        const activeSub = SUB_TABS.find(s => {
            const el = _hostElementFor(s.id);
            return el && el.classList.contains('active');
        });
        if (activeSub) injectSubNav(activeSub.id);
    }

    // Public API
    window.MetaAnalysisHub = {
        renderTiles,
        renderAnswer,
        answerModel,
        enterSubTab,
        exitToHub,
        injectSubNav,
        clearAllSubNavHosts,
        onTabSwitched,
        isSubTab,
        refreshLanguage,
        SUB_TABS
    };

    document.addEventListener('DOMContentLoaded', () => {
        renderTiles();
        renderAnswer();
        // If the hub is the initially-active tab, nothing else is needed.
        // Re-render on language change.
        document.addEventListener('languageChanged', refreshLanguage);
    });
})();
