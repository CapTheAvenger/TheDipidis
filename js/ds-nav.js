/* ds-nav.js — die sechs Ziele der Hauptnavigation und der Datenraum-Ausweis.
 *
 * WARUM ES DAS GIBT
 * Bis zum 17.08.2026 hatte die Seite faktisch keine sichtbare Navigation:
 * die Leiste in index.html war per `display: none !important`
 * (css/pokeball-menu.css) global abgeschaltet, und der Pokéball daneben
 * trägt kein Label. Die Startseite verlinkte 6 von 12 Bereichen; Card
 * Database, Deck Builder, Rechner, Proxy, Side Quest und die Anleitung
 * waren von dort aus unerreichbar.
 *
 * DER SCHNITT
 * Die sechs Ziele folgen den vier Fragen, die die Seite ohnehin
 * beantwortet — belegt durch das Funktionsinventar vom 17.08.:
 *   Start    Was ist gerade stark?
 *   Meta     Wie sieht das Feld aus?
 *   Decks    Wie sieht die Liste dazu aus?
 *   Turnier  Was steht am Samstag im Feld?
 *   Karten   Was muss ich davon besitzen?
 * Champions steht abgesetzt: Pokémon Champions ist ein anderes Spiel, und
 * das stand bisher nirgends.
 *
 * WIE ES SICH EINFÜGT
 * Kein neuer Router. Jedes Ziel ruft `switchTabAndUpdateMenu` mit einem
 * vorhandenen Tab auf; die Untertab-Navigation des Hubs bleibt, wie sie
 * ist. Der Pokéball bleibt ebenfalls — er führt weiter die vollständige
 * Liste aller 30 Einträge. Neu ist nur die Ebene darüber.
 *
 * `switchTab` wird umschlossen statt verändert, damit app-core.js
 * unangetastet bleibt und diese Datei ohne Folgen wieder entfernbar ist.
 */
(function () {
    'use strict';

    // Gruppe -> { Standardziel, Mitglieder }. Die Mitglieder entscheiden,
    // welcher Knopf aktiv leuchtet, wenn man über einen anderen Weg
    // (Pokéball, Hub-Kachel, Deep-Link) in einem Tab landet.
    var GROUPS = [
        { id: 'start',     go: 'meta-analysis-hub', gl: '◉',
          tabs: ['meta-analysis-hub'] },
        { id: 'meta',      go: 'current-meta',      gl: '▦',
          tabs: ['current-meta', 'city-league', 'past-meta'] },
        { id: 'decks',     go: 'current-analysis',  gl: '▤',
          tabs: ['current-analysis', 'city-league-analysis'] },
        { id: 'turnier',   go: 'profile',           gl: '★',
          tabs: [] },                       // Profil ist geteilt, siehe unten
        { id: 'karten',    go: 'cards',             gl: '◫',
          tabs: ['cards', 'proxy', 'calculator'] },
        { id: 'champions', go: 'side-quest',        gl: '◆', alt: true,
          tabs: ['side-quest'] }
    ];

    var LABELS = {
        de: { start: 'Start', meta: 'Meta', decks: 'Decks', turnier: 'Turnier',
              karten: 'Karten', champions: 'Champions' },
        en: { start: 'Home', meta: 'Meta', decks: 'Decks', turnier: 'Event',
              karten: 'Cards', champions: 'Champions' }
    };

    // Datenraum je Tab. Region, Format und Quelle sind strukturelle
    // Wahrheiten und stehen hier; Stichprobe und Stand werden zur Laufzeit
    // ergänzt, wenn sie bekannt sind — lieber ein Feld weglassen als eine
    // Zahl behaupten (Projektregel: melden, nicht raten).
    var SPACES = {
        'city-league':          'jp',
        'city-league-analysis': 'jp',
        'current-meta':         'gl',
        'current-analysis':     'gl',
        'past-meta':            'past'
    };

    var SPACE_TEXT = {
        jp: {
            de: { region: '🇯🇵 Japan · City League', source: 'limitlesstcg.com/jp',
                  note: 'Global und Past werden getrennt geführt und nie mit diesen Zahlen gemischt.' },
            en: { region: '🇯🇵 Japan · City League', source: 'limitlesstcg.com/jp',
                  note: 'Global and Past are kept separate and never mixed into these numbers.' }
        },
        gl: {
            de: { region: '🌐 Global · Online + Majors', source: 'Limitless Online',
                  note: 'Japan und Past werden getrennt geführt und nie mit diesen Zahlen gemischt.' },
            en: { region: '🌐 Global · Online + Majors', source: 'Limitless Online',
                  note: 'Japan and Past are kept separate and never mixed into these numbers.' }
        },
        past: {
            de: { region: '📦 Past · eingefrorene Formate', source: 'Limitless Labs',
                  note: 'Japan und Global werden getrennt geführt und nie mit diesen Zahlen gemischt.' },
            en: { region: '📦 Past · frozen formats', source: 'Limitless Labs',
                  note: 'Japan and Global are kept separate and never mixed into these numbers.' }
        }
    };

    var F = {
        de: { format: 'Format', source: 'Quelle', sample: 'Stichprobe',
              window: 'Zeitfenster', stamp: 'Stand', pause: 'Saisonpause — keine aktuellen Daten',
              entries: 'gewichtete Antritte', since: 'in Person legal seit' },
        en: { format: 'Format', source: 'Source', sample: 'Sample',
              window: 'Window', stamp: 'Updated', pause: 'Off-season — no current data',
              entries: 'weighted entries', since: 'in-person legal since' }
    };

    function lang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'de';
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }
    function groupForTab(tabId) {
        for (var i = 0; i < GROUPS.length; i++) {
            if (GROUPS[i].tabs.indexOf(tabId) !== -1) return GROUPS[i].id;
        }
        // Das Profil trägt zwei Gruppen: Meta Call und Battle Journal sind
        // Turniervorbereitung, alles andere gehört zu den Karten. Bis Meta
        // Call aus #profile-content herausgelöst ist (eigener Schritt),
        // entscheidet der aktive Untertab.
        if (tabId === 'profile') {
            var sub = document.querySelector('.profile-tab-btn.active');
            var key = sub && (sub.dataset.profileTab || sub.getAttribute('onclick') || '');
            return /metacall|journal/i.test(key || '') ? 'turnier' : 'karten';
        }
        if (tabId === 'tutorial') return 'start';
        return null;
    }

    function render() {
        var host = document.getElementById('dsNavHost');
        var bar  = document.getElementById('dsTabbarHost');
        if (!host) return;
        var L = LABELS[lang()];

        host.innerHTML = GROUPS.map(function (g, i) {
            var sep = (g.alt && i > 0) ? '<span class="ds-nav-sep" aria-hidden="true"></span>' : '';
            return sep + '<button type="button" class="ds-nav-btn' + (g.alt ? ' is-alt' : '') +
                '" data-ds-group="' + g.id + '">' + esc(L[g.id]) + '</button>';
        }).join('');

        if (bar) {
            // Auf Mobil fünf Ziele — Champions ist der seltenste und bleibt
            // dem Pokéball-Menü vorbehalten, statt einen Platz zu belegen,
            // den Karten oder Turnier täglich brauchen.
            bar.innerHTML = GROUPS.filter(function (g) { return !g.alt; }).map(function (g) {
                return '<button type="button" class="ds-tabbar-btn" data-ds-group="' + g.id + '">' +
                    '<span class="ds-tabbar-gl" aria-hidden="true">' + g.gl + '</span>' +
                    esc(L[g.id]) + '</button>';
            }).join('');
        }

        [host, bar].forEach(function (el) {
            if (!el) return;
            el.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-ds-group]');
                if (!btn) return;
                var g = GROUPS.filter(function (x) { return x.id === btn.dataset.dsGroup; })[0];
                if (!g) return;
                if (typeof window.switchTabAndUpdateMenu === 'function') {
                    window.switchTabAndUpdateMenu(g.go);
                } else if (typeof window.switchTab === 'function') {
                    window.switchTab(g.go);
                }
            });
        });
    }

    function syncActive(tabId) {
        var g = groupForTab(tabId);
        document.querySelectorAll('[data-ds-group]').forEach(function (b) {
            if (b.dataset.dsGroup === g) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
    }

    /* ── Datenraum-Ausweis ─────────────────────────────────────────── */

    // Nur setzen, was wirklich bekannt ist. window._formatWindow wird beim
    // Deploy aus data/format_window.json in index.html gestempelt.
    function fw() { return window._formatWindow || {}; }

    function fmtDate(iso) {
        if (!iso) return '';
        var p = String(iso).slice(0, 10).split('-');
        return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : '';
    }

    // Das Formatfenster ist die eine Quelle fuer "welches Format gilt hier".
    // Steht als eigener Helfer da, weil ihn zwei Aufrufer brauchen: die
    // Ausweiszeile und DsNav.getFacts() fuer die Bildkarte. Zwei Kopien
    // waeren zwei Formate.
    function formatFor(key) {
        var w = fw();
        if (key === 'jp' && w.current_set_jp) {
            return { label: w.current_set_jp, since: '' };
        }
        if (key === 'gl' && w.current_set) {
            return {
                label: (w.oldest_legal_set ? w.oldest_legal_set + '\u2013' : '') + w.current_set,
                since: w.in_person_legal_date ? fmtDate(w.in_person_legal_date) : ''
            };
        }
        if (key === 'past' && w.previous_format_key) {
            return { label: w.previous_format_key, since: '' };
        }
        return { label: '', since: '' };
    }

    function stampFor(facts) {
        return (facts && facts.stamp) ||
            (typeof localStorage !== 'undefined' ? localStorage.getItem('lastScraperUpdate') : '') || '';
    }

    function renderSpace(tabId) {
        var host = document.getElementById('dsSpaceHost');
        if (!host) return;
        var key = SPACES[tabId];
        if (!key) { host.innerHTML = ''; host.hidden = true; return; }
        host.hidden = false;

        var lg = lang(), t = SPACE_TEXT[key][lg], f = F[lg];
        var bits = [];

        bits.push('<span class="ds-space-region">' + t.region + '</span>');

        var fmt = formatFor(key);
        if (fmt.label) {
            bits.push('<span><b>' + f.format + '</b> ' + esc(fmt.label) +
                (fmt.since ? esc(' (' + f.since + ' ' + fmt.since + ')') : '') + '</span>');
        }

        bits.push('<span><b>' + f.source + '</b> ' + esc(t.source) + '</span>');

        // Stichprobe und Stand liefert die jeweilige Ansicht über
        // DsNav.setSpaceFacts(). Fehlt eine Angabe, bleibt sie weg — eine
        // erfundene Zahl wäre schlimmer als eine fehlende.
        var facts = (host._facts || {})[key] || {};
        if (facts.sample) {
            bits.push('<span><b>' + f.sample + '</b> ' + esc(facts.sample) + '</span>');
        }
        if (facts.window) {
            bits.push('<span><b>' + f.window + '</b> ' + esc(facts.window) + '</span>');
        }
        var stamp = stampFor(facts);
        if (stamp) bits.push('<span><b>' + f.stamp + '</b> ' + esc(stamp) + '</span>');
        if (facts.pause) bits.push('<span class="ds-space-pause">' + esc(f.pause) + '</span>');

        host.setAttribute('data-space', key);
        host.innerHTML = bits.join('<span class="ds-space-sep" aria-hidden="true">·</span>') +
            '<span class="ds-space-note">' + esc(t.note) + '</span>';
    }

    var current = null;

    function onTab(tabId) {
        current = tabId;
        syncActive(tabId);
        renderSpace(tabId);
    }

    // Öffentliche Schnittstelle für die Ansichten: sobald eine Ansicht
    // weiß, auf wie vielen Antritten ihre Zahlen beruhen, schreibt sie es
    // hierher. Beispiel aus app-tier-meta.js:
    //   DsNav.setSpaceFacts({ sample: '7.456 gewichtete Antritte', window: '20.07.–17.08.' })
    window.DsNav = {
        // Fakten werden nach DATENRAUM abgelegt, nicht nach Tab. Die Ansichten
        // laden asynchron: die City-League-Daten sind beim Seitenstart fertig,
        // während noch der Hub aktiv ist — nach `current` geschlüsselt landeten
        // sie unter 'meta-analysis-hub' und waren nie zu sehen. Der Datenraum
        // ist ohnehin die richtige Ebene: 'gl' gilt für current-meta und
        // current-analysis gleichermaßen.
        setSpaceFacts: function (facts, space) {
            var host = document.getElementById('dsSpaceHost');
            if (!host) return;
            var key = space || SPACES[current];
            if (!key) return;
            host._facts = host._facts || {};
            host._facts[key] = Object.assign({}, host._facts[key] || {}, facts || {});
            renderSpace(current);
        },
        refresh: function () { render(); onTab(current); },

        // Was der Ausweis über einem Datenraum gerade weiss — Region,
        // Quelle, Format, Stichprobe, Stand. js/ds-share.js schreibt das
        // in den Fuss der Bildkarte: das Bild verlaesst die Seite, und
        // ohne diese Zeile waere nicht mehr erkennbar, aus welchem der
        // drei Raeume die Zahlen stammen.
        getFacts: function (space) {
            var key = space || SPACES[current];
            if (!key || !SPACE_TEXT[key]) return null;
            var host = document.getElementById('dsSpaceHost');
            var live = (host && host._facts && host._facts[key]) || {};
            var txt = SPACE_TEXT[key][lang()];
            return {
                space:  key,
                region: txt.region,
                source: live.source || txt.source,
                format: live.format || formatFor(key).label,
                sample: live.sample || '',
                window: live.window || '',
                stamp:  stampFor(live),
                pause:  !!live.pause
            };
        },
        spaceForTab: function (tabId) { return SPACES[tabId] || null; }
    };

    function boot() {
        render();

        // switchTab umschließen statt anfassen: app-core.js bleibt
        // unverändert, und diese Datei ist ohne Rückbau entfernbar.
        var orig = window.switchTab;
        if (typeof orig === 'function' && !orig.__dsWrapped) {
            var wrapped = function (tabName) {
                var r = orig.apply(this, arguments);
                try { onTab(tabName); } catch (e) { /* Navigation darf nie an der Leiste scheitern */ }
                return r;
            };
            wrapped.__dsWrapped = true;
            window.switchTab = wrapped;
        }

        // Profil-Untertabs entscheiden zwischen "Turnier" und "Karten".
        document.addEventListener('click', function (e) {
            if (e.target.closest('.profile-tab-btn')) setTimeout(function () { syncActive(current); }, 0);
        }, true);

        // Auf document, nicht auf window: js/i18n.js:3943 verschickt
        // `new CustomEvent('languageChanged', ...)` ohne `bubbles`, also
        // steigt das Ereignis nicht bis window auf. Der window-Listener,
        // der hier bis zum 18.08.2026 stand, hat nie ausgeloest — die
        // Leiste blieb nach jedem Sprachwechsel auf der alten Sprache
        // stehen, waehrend der Rest der Seite umschaltete. Beide bleiben
        // registriert, falls jemand spaeter auf window verschickt;
        // refresh() ist idempotent.
        document.addEventListener('languageChanged', function () { window.DsNav.refresh(); });
        window.addEventListener('languageChanged', function () { window.DsNav.refresh(); });

        var active = document.querySelector('.tab-content.active');
        onTab(active ? active.id : 'meta-analysis-hub');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
