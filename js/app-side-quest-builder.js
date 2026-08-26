// Side Quest · Team Builder (doubles)
// ============================================================================
// Co-occurrence team builder over the in-game DOUBLES teammate data
// (data/champions_usage.json — the same source as the Kampfdaten "Team-
// Mitglieder" list). Pick a Pokémon → the builder shows the Pokémon it's played
// alongside. Pick another → the pool narrows to Pokémon that are teammates of
// BOTH, and so on up to 6. Doubles only.
//
// The usage data keys Pokémon by SLUG ("hisuian-zoroark") but stores the base
// `name` ("Zoroark"); the teammate lists carry the proper FORM names ("Hisuian
// Zoroark"). So we work in slug space and take display names from the teammate
// lists, which is the only place the form names appear.
(function () {
    'use strict';

    const USAGE_URL = 'data/champions_usage.json';
    const DE_NAMES_URL = 'data/pokemon_names_de.json';
    const HOST_ID = 'sideQuestBuilderHost';
    const MAX = 6;
    const EMPTY_CAP = 40;   // "most-played" mons shown before any pick

    let _loaded = false;
    let _bySlug = {};       // slug → { slug, display, baseEn, mates: [slug] }
    let _mons = [];         // all mon objects
    let _degree = {};       // slug → # of teammate lists it appears on (popularity)
    let _deNames = {}, _deLoaded = false;

    let _team = [];         // selected slugs
    let _query = '';

    // ── Ab hier der Schreibpfad (26.08.2026) ────────────────────────────────
    // Bis heute endete der Builder bei der Auswahl: _team lebte im RAM und
    // verliess das Modul nie. "Setzen" macht aus den sechs Slugs sechs
    // vollstaendige Baeue (Faehigkeit, Item, Wesen, vier Attacken, Verteilung),
    // die man einzeln bearbeiten, speichern, aktiv schalten und exportieren
    // kann. Der Vorgabebau kommt aus derselben Nutzungsquelle wie die
    // Vorschlaege — was am haeufigsten gespielt wird, steht schon da.
    const DEX_URL = 'data/pokemon_battle_data.json';
    let _raw = {};          // slug → Rohblock aus champions_usage.json
    let _dex = {}, _dexLoaded = false;
    let _sets = {};         // slug → { showdown, item, ability, nature, moves[], sp{} }
    let _gesetzt = false;   // steht die Bau-Ansicht?
    let _editSlug = null;   // welches Pokémon liegt gerade im Modal?
    let _teamName = '';

    function uiLang() { return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en'; }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function norm(s) { return String(s || '').trim().toLowerCase(); }
    function slugify(s) { return norm(s).replace(/\s+/g, '-'); }
    function titleFromSlug(slug) {
        return String(slug || '').split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
    }

    const LABELS = {
        de: {
            intro: 'Bau dir ein Doppelkampf-Team: Wähl ein Pokémon — der Builder zeigt dir, mit welchen Pokémon es zusammen gespielt wird (In-Game-Analyse). Jede weitere Wahl grenzt ein: es bleiben nur Pokémon, die mit allen Gewählten zusammen gespielt werden.',
            searchPh: '🔎 Pokémon hinzufügen (Deutsch oder Englisch) …',
            picked: (n) => `${n} / ${MAX} gewählt`,
            suggestTitle: 'Passt dazu',
            suggestHintFirst: 'Meistgespielte Pokémon — tippen zum Starten, oder oben suchen.',
            suggestHint: 'Sortiert nach Überschneidung — % = auf wie vielen Partner-Listen deiner Gewählten das Pokémon steht. Tippen zum Hinzufügen.',
            freeTitle: 'Weitere Treffer',
            freeHint: 'Diese stehen auf keiner Partner-Liste deiner Auswahl — dort ist je Pokémon nur Platz für acht. Wählbar sind sie trotzdem.',
            freeNone: 'Kein Pokémon dieses Namens gefunden.',
            none: 'Keine weitere Kombination gefunden — nimm ein Pokémon raus.',
            empty: 'Wähl ein Pokémon, um zu starten.',
            clear: 'Zurücksetzen',
            remove: 'Entfernen',
            attribution: 'Basis: In-Game-Doppelkampf-Analyse (championsbattledata.com).',
            setzen: '✓ Team setzen',
            setzenHint: 'Übernimmt die Auswahl und baut aus der Nutzungsanalyse für jedes Pokémon einen Vorschlag: Fähigkeit, Item, Wesen, vier Attacken und Statuswertpunkte. Alles danach änderbar.',
            zurueckZurAuswahl: '← zurück zur Auswahl',
            bauTitel: 'Dein Team',
            bearbeiten: 'Bearbeiten',
            namePh: 'Teamname (optional)',
            speichern: '💾 Als eigenes Team speichern',
            gespeichert: 'Team gespeichert — es steht jetzt unter „Teams“ bei „Meine Teams“.',
            speichernFehler: 'Speichern nicht möglich — der Browser lässt keinen lokalen Speicher zu (privates Fenster?). Nutz den Export, dann geht nichts verloren.',
            aktivSetzen: '⚡ Das spiele ich gerade',
            aktivGesetzt: 'Als aktives Team gesetzt.',
            exportL: '🏆 Limitless-Paste',
            exportS: '⚔️ Showdown-Paste',
            kopiert: 'In die Zwischenablage kopiert.',
            modalTitel: (n) => `${n} bearbeiten`,
            faehigkeit: 'Fähigkeit',
            item: 'Item',
            wesen: 'Wesen',
            attacken: 'Attacken',
            punkte: 'Statuswertpunkte',
            punkteHint: (b, m) => `0–${m} je Wert, zusammen höchstens ${b}.`,
            budget: (n, b) => `${n} / ${b}`,
            budgetVoll: 'Budget ausgeschöpft',
            standard: 'Auf Standard zurücksetzen',
            fertig: 'Fertig',
            keineDaten: 'Für dieses Pokémon liegen keine Nutzungsdaten vor — Vorgaben sind leer.',
            nameUnklar: 'Für dieses Pokémon fehlt der Showdown-Name; es bleibt beim Anzeigenamen und Showdown erkennt es womöglich nicht.',
            evWarnung: (n) => `Achtung: als Showdown-EVs sind das ${n} Punkte über dem 510er-Budget. Limitless nimmt den Bau trotzdem an, Showdown lehnt ihn ab.`,
        },
        en: {
            intro: 'Build a doubles team: pick a Pokémon — the builder shows who it is played alongside (in-game analysis). Each further pick narrows the pool to Pokémon played with ALL of your picks.',
            searchPh: '🔎 Add a Pokémon (German or English) …',
            picked: (n) => `${n} / ${MAX} selected`,
            suggestTitle: 'Plays with',
            suggestHintFirst: 'Most-played Pokémon — tap to start, or search above.',
            suggestHint: 'Sorted by overlap — % is how many of your picks list it as a partner. Tap to add.',
            freeTitle: 'Other matches',
            freeHint: 'These are on none of your picks\' partner lists — each Pokémon only has eight slots there. You can still pick them.',
            freeNone: 'No Pokémon of that name found.',
            none: 'No further combination found — remove a Pokémon.',
            empty: 'Pick a Pokémon to start.',
            clear: 'Reset',
            remove: 'Remove',
            attribution: 'Based on in-game doubles analysis (championsbattledata.com).',
            setzen: '✓ Set team',
            setzenHint: 'Takes your picks and builds a suggestion for each Pokémon from the usage analysis: ability, item, nature, four moves and stat points. Everything stays editable.',
            zurueckZurAuswahl: '← back to picking',
            bauTitel: 'Your team',
            bearbeiten: 'Edit',
            namePh: 'Team name (optional)',
            speichern: '💾 Save as my team',
            gespeichert: 'Team saved — it is now under "Teams" in "My teams".',
            speichernFehler: 'Could not save — this browser blocks local storage (private window?). Use the export instead so nothing is lost.',
            aktivSetzen: '⚡ This is what I play',
            aktivGesetzt: 'Set as the active team.',
            exportL: '🏆 Limitless paste',
            exportS: '⚔️ Showdown paste',
            kopiert: 'Copied to clipboard.',
            modalTitel: (n) => `Edit ${n}`,
            faehigkeit: 'Ability',
            item: 'Item',
            wesen: 'Nature',
            attacken: 'Moves',
            punkte: 'Stat points',
            punkteHint: (b, m) => `0–${m} per stat, ${b} in total.`,
            budget: (n, b) => `${n} / ${b}`,
            budgetVoll: 'Budget spent',
            standard: 'Reset to default',
            fertig: 'Done',
            keineDaten: 'No usage data for this Pokémon — defaults are empty.',
            nameUnklar: 'No Showdown name for this Pokémon; it keeps its display name and Showdown may not recognise it.',
            evWarnung: (n) => `Heads up: as Showdown EVs this is ${n} over the 510 budget. Limitless accepts the build, Showdown rejects it.`,
        },
    };
    function t() { return LABELS[uiLang()]; }

    async function load() {
        if (_loaded) return;
        try {
            const r = await fetch(`${USAGE_URL}?t=${Date.now()}`);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            const pk = (j && j.pokemon) || {};

            // Proper form display names live only in the teammate lists.
            const displayBySlug = {};
            Object.keys(pk).forEach(slug => {
                ((pk[slug].doubles || {}).teammate || []).forEach(x => {
                    if (x && x.name) { const s = slugify(x.name); if (!displayBySlug[s]) displayBySlug[s] = x.name; }
                });
            });

            _bySlug = {}; _mons = []; _degree = {}; _raw = pk;
            Object.keys(pk).forEach(slug => {
                const e = pk[slug] || {};
                const mates = ((e.doubles || {}).teammate || []).map(x => slugify(x && x.name)).filter(Boolean);
                const mon = {
                    slug,
                    display: displayBySlug[slug] || titleFromSlug(slug) || e.name || slug,
                    baseEn: e.name || '',
                    mates,
                };
                _bySlug[slug] = mon;
                _mons.push(mon);
            });
            _mons.forEach(m => {
                const seen = new Set();
                m.mates.forEach(s => { if (seen.has(s)) return; seen.add(s); _degree[s] = (_degree[s] || 0) + 1; });
            });
            _mons.sort((a, b) => a.display.localeCompare(b.display));
        } catch (err) {
            console.warn('[SideQuest/builder] failed to load usage', err);
            _bySlug = {}; _mons = []; _degree = {};
        }
        _loaded = true;
    }
    async function loadDex() {
        if (_dexLoaded) return;
        try {
            const r = await fetch(`${DEX_URL}?t=${Date.now()}`);
            if (r.ok) { const j = await r.json(); if (j && typeof j === 'object') _dex = j; }
        } catch (err) { /* zuShowdown faellt dann auf "ungeprueft" zurueck */ }
        _dexLoaded = true;
    }

    async function loadDe() {
        if (_deLoaded) return;
        try {
            const r = await fetch(`${DE_NAMES_URL}?t=${Date.now()}`);
            if (r.ok) { const j = await r.json(); if (j && typeof j === 'object') _deNames = j; }
        } catch (err) { /* stays English-only */ }
        _deLoaded = true;
    }

    // ── Co-occurrence core ──────────────────────────────────────────────────
    // Rank every candidate by OVERLAP: the share of the selected Pokémon whose
    // teammate list contains it. 100 % = played alongside all of them; then 75 %
    // (3 of 4), 50 %, … so the pool never dead-ends when no single Pokémon has
    // been played with the whole selection. Ties break on the summed list
    // position (fits higher up). With nothing picked, rank by overall popularity.
    function candidates() {
        const sel = new Set(_team);
        if (_team.length === 0) {
            return _mons
                .filter(m => !sel.has(m.slug))
                .map(m => ({ slug: m.slug, count: 0, overlap: 1, score: -(_degree[m.slug] || 0) }))
                .sort((a, b) => a.score - b.score || dispSlug(a.slug).localeCompare(dispSlug(b.slug)));
        }
        const agg = new Map();   // slug → { count, posSum }
        _team.forEach(s => {
            const mates = (_bySlug[s] && _bySlug[s].mates) || [];
            mates.forEach((ts, i) => {
                if (sel.has(ts)) return;
                const e = agg.get(ts) || { count: 0, posSum: 0 };
                e.count++; e.posSum += i; agg.set(ts, e);
            });
        });
        const n = _team.length;
        return [...agg.entries()]
            .map(([slug, e]) => ({ slug, count: e.count, overlap: e.count / n, score: e.posSum }))
            .sort((a, b) => b.count - a.count || a.score - b.score || dispSlug(a.slug).localeCompare(dispSlug(b.slug)));
    }

    // ── Names / sprites ─────────────────────────────────────────────────────
    function dispSlug(slug) { const m = _bySlug[slug]; return (m && m.display) || titleFromSlug(slug); }
    function displayName(slug) {
        const m = _bySlug[slug];
        if (uiLang() === 'de' && m && m.baseEn) {
            const de = _deNames[m.baseEn];
            // Pure base form → localise; form (Hisuian/Mega/…) → keep the English
            // form name (German form names aren't in the base-name map).
            if (de && norm(m.display) === norm(m.baseEn)) return de;
        }
        return dispSlug(slug);
    }
    function searchHay(slug) {
        const m = _bySlug[slug];
        return norm(dispSlug(slug)) + ' ' + norm((m && _deNames[m.baseEn]) || '');
    }
    // The usage slug ("alolan-ninetales", "basculegion-male",
    // "maushold-family-of-four") is NOT the Limitless sprite slug. Derive the
    // sprite slug from the display NAME the way the app's icon helper does:
    // a regional/mega prefix combines with the species ("Alolan Ninetales" →
    // ninetales-alola, "Hisuian Zoroark" → zoroark-hisui); otherwise use the base
    // species word and drop trailing form words ("Basculegion Male" →
    // basculegion, "Maushold Family of Four" → maushold).
    const _FORM_SUFFIX = {
        alolan: 'alola', alola: 'alola', galarian: 'galar', galar: 'galar',
        hisuian: 'hisui', hisui: 'hisui', paldean: 'paldea', paldea: 'paldea',
        mega: 'mega', bloodmoon: 'bloodmoon',
    };
    function spriteSlug(name) {
        const words = norm(name).split(/[\s-]+/).filter(Boolean);
        if (!words.length) return '';
        if (_FORM_SUFFIX[words[0]] && words[1]) return words[1] + '-' + _FORM_SUFFIX[words[0]];
        return words[0];
    }
    function icon(slug) {
        const name = dispSlug(slug);
        const sprite = spriteSlug(name);
        if (window.ArchetypeIcons && typeof window.ArchetypeIcons.slugIconHtml === 'function') {
            return window.ArchetypeIcons.slugIconHtml(sprite, { size: 'md', alt: name });
        }
        const url = 'https://r2.limitlesstcg.net/pokemon/gen9/' + sprite + '.png';
        return `<img class="tcg-pokemon-icon tcg-pokemon-icon--md" src="${url}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`;
    }

    // ── Mutations ───────────────────────────────────────────────────────────
    // Aendert sich die Auswahl, ist der Bau nicht mehr derselbe Bau: die
    // Saetze gehoeren zu den Slugs, die drin waren. Statt still das Falsche
    // weiterzuzeigen, faellt die Ansicht auf die Auswahl zurueck. Die
    // bereits bearbeiteten Saetze bleiben in _sets stehen und kommen beim
    // naechsten "Setzen" unveraendert zurueck — wer ein Pokémon tauscht,
    // verliert nicht die Arbeit an den anderen fuenf.
    function auswahlGeaendert() { _gesetzt = false; }

    function addMon(slug) {
        if (_team.length >= MAX || _team.indexOf(slug) !== -1) return;
        _team.push(slug); _query = '';
        auswahlGeaendert();
        render();
    }
    function removeMon(slug) { _team = _team.filter(s => s !== slug); auswahlGeaendert(); render(); }
    function clearAll() { _team = []; _query = ''; _sets = {}; _teamName = ''; auswahlGeaendert(); render(); }

    // ── Render ──────────────────────────────────────────────────────────────
    /** Ein Vorschlagsknopf. */
    function suggBtn(c, showPct) {
        const pct = showPct
            ? `<span class="sqb-sugg-count">${Math.round(c.overlap * 100)}%</span>` : '';
        const partial = showPct && c.overlap < 1 ? ' is-partial' : '';
        return `<button type="button" class="sqb-sugg${partial}" data-add="${escapeHtml(c.slug)}">
                ${icon(c.slug)}
                <span class="sqb-sugg-name">${escapeHtml(displayName(c.slug))}</span>
                ${pct}
            </button>`;
    }

    /** Treffer der Suche, die in KEINER Partner-Liste der Auswahl stehen.
     *
     *  Bis zum 25.08.2026 suchte das Feld nur innerhalb der Vorschläge. Weil
     *  jede Partner-Liste genau acht Plätze hat, waren damit ab der ersten
     *  Wahl 211 der 353 Pokémon unerreichbar — gemeldet als "ich tippe Ra und
     *  bekomme kein Raichu". Sie stehen jetzt in einem eigenen Block darunter.
     *
     *  Bewusst OHNE Wertung: die Partner-Listen tragen keine Prozentwerte
     *  (alle 2824 Einträge haben pct: null) und sind auf acht gedeckelt.
     *  "Wird nicht zusammen gespielt" wäre also mehr behauptet, als die Daten
     *  hergeben. Der Hinweis nennt deshalb den Mechanismus, nicht ein Urteil. */
    function freieTreffer(q) {
        if (!q) return [];
        const sel = new Set(_team);
        const inVorschlag = new Set(candidates().map(c => c.slug));
        return _mons
            .filter(m => !sel.has(m.slug) && !inVorschlag.has(m.slug)
                         && searchHay(m.slug).indexOf(q) !== -1)
            .map(m => ({ slug: m.slug, overlap: 0 }));
    }

    function suggestionsHtml(l) {
        const q = norm(_query);
        let cand = candidates().filter(c => !q || searchHay(c.slug).indexOf(q) !== -1);
        if (_team.length === 0 && !q) cand = cand.slice(0, EMPTY_CAP);
        const frei = _team.length < MAX ? freieTreffer(q) : [];
        if (!cand.length && !frei.length) {
            return `<p class="sqb-none">${escapeHtml(
                q ? l.freeNone : (_team.length ? l.none : l.empty))}</p>`;
        }
        // Overlap % is only meaningful with ≥ 2 picks (with 1 pick everything is
        // 100 % — the mon's own teammate list).
        const showPct = _team.length >= 2;
        let html = cand.map(c => suggBtn(c, showPct)).join('');
        if (frei.length) {
            html += `<div class="sqb-free">
                <h4 class="sqb-sec sqb-sec--free">${escapeHtml(l.freeTitle)}</h4>
                <p class="sqb-hint">${escapeHtml(l.freeHint)}</p>
                <div class="sqb-suggs">${frei.map(c => suggBtn(c, false)).join('')}</div>
            </div>`;
        }
        return html;
    }

    // ── Vorgabebau aus der Nutzungsanalyse ──────────────────────────────────
    // Was am haeufigsten gespielt wird, ist der beste Startpunkt: die Quelle
    // fuehrt je Pokémon eine Rangliste fuer Attacken, Item, Faehigkeit, Wesen
    // und Verteilung. Wir nehmen jeweils oben. Fehlt eine Kategorie, bleibt
    // das Feld leer — geraten wird nichts.
    function CS() { return window.ChampionsSet; }

    function block2(slug) {
        const e = _raw[slug] || {};
        return e.doubles || {};
    }
    function topN(liste, n) {
        return (liste || []).slice(0, n).map(x => (x && x.name) || '').filter(Boolean);
    }
    function showdownName(slug) {
        const N = window.ChampionsNames;
        const aufgeloest = N && typeof N.zuShowdown === 'function'
            ? N.zuShowdown(slug, _dexLoaded && Object.keys(_dex).length ? _dex : null)
            : null;
        return aufgeloest || displayName(slug) || titleFromSlug(slug);
    }
    function nameSicher(slug) {
        const N = window.ChampionsNames;
        if (!N || typeof N.zuShowdown !== 'function') return false;
        return !!N.zuShowdown(slug, _dexLoaded && Object.keys(_dex).length ? _dex : null);
    }

    function standardSet(slug) {
        const b = block2(slug);
        const spread = (b.stat_points || [])[0];
        return {
            slug,
            showdown: showdownName(slug),
            sicher: nameSicher(slug),
            ability: topN(b.ability, 1)[0] || '',
            item: topN(b.held_item, 1)[0] || '',
            nature: topN(b.nature, 1)[0] || '',
            moves: topN(b.move, 4),
            sp: CS().clampSpread((spread && spread.points) || {}),
        };
    }

    function setzeTeam() {
        _team.forEach(slug => { if (!_sets[slug]) _sets[slug] = standardSet(slug); });
        _gesetzt = true;
        render();
    }

    // ── Das Team als Objekt, wie der Teams-Reiter es kennt ───────────────────
    // Genau das Format aus makeImportedTeam() in js/app-side-quest.js: die
    // Speed-Leiter, die Marken und der Export lesen alle dieselbe Form.
    // `evs` traegt die ROHEN Champions-Punkte — so, wie der Import aus einer
    // Pokepaste sie auch ablegt. Die Umrechnung auf Showdown passiert erst
    // beim Export, nicht im Speicher.
    function alsTeamObjekt() {
        const mons = _team.map(slug => {
            const st = _sets[slug] || standardSet(slug);
            return {
                name: st.showdown,
                item: st.item || '',
                ability: st.ability || '',
                nature: st.nature || '',
                tera_type: '',
                evs: CS().toChampionsText(st.sp),
                moves: (st.moves || []).filter(Boolean).slice(0, 4),
            };
        });
        return { mons, name: _teamName };
    }

    function pasteText(showdownEinheiten) {
        const CSx = CS();
        const zeilen = [];
        _team.forEach(slug => {
            const st = _sets[slug] || standardSet(slug);
            const evs = showdownEinheiten ? CSx.toShowdownText(st.sp) : CSx.toChampionsText(st.sp);
            zeilen.push(st.item ? `${st.showdown} @ ${st.item}` : st.showdown);
            if (st.ability) zeilen.push(`Ability: ${st.ability}`);
            zeilen.push('Level: 50');
            if (evs) zeilen.push(`EVs: ${evs}`);
            if (st.nature) zeilen.push(`${st.nature} Nature`);
            (st.moves || []).filter(Boolean).forEach(m => zeilen.push(`- ${m}`));
            zeilen.push('');
        });
        return zeilen.join('\n').trim();
    }

    function ueberschussGesamt() {
        let max = 0;
        _team.forEach(slug => {
            const st = _sets[slug] || standardSet(slug);
            max = Math.max(max, CS().showdownUeberschuss(st.sp));
        });
        return max;
    }

    function melde(text, art) {
        if (typeof window.showNotification === 'function') window.showNotification(text, art || 'info');
        else console.info('[SideQuest/builder]', text);
    }

    async function kopiere(text, l) {
        try {
            await navigator.clipboard.writeText(text);
            melde(l.kopiert, 'success');
        } catch (err) {
            // Ohne Zwischenablage-Recht bleibt der Text im Textfeld stehen —
            // markieren und selbst kopieren geht immer.
            const ta = document.querySelector('.sqb-paste');
            if (ta) { ta.focus(); ta.select(); }
        }
    }

    function speichere(l) {
        const { mons, name } = alsTeamObjekt();
        const api = window.sideQuest;
        if (!api || typeof api.addImportedTeam !== 'function') {
            melde(l.speichernFehler, 'error');
            return;
        }
        const res = api.addImportedTeam(mons, name);
        if (res && res.ok) {
            melde(l.gespeichert, 'success');
            return res.team;
        }
        melde(l.speichernFehler, 'error');
        return null;
    }

    function aktivSetzen(l) {
        const team = speichere(l);
        if (!team) return;
        const api = window.sideQuest;
        if (api && typeof api.setActiveTeam === 'function') {
            api.setActiveTeam(team.replica_code);
            melde(l.aktivGesetzt, 'success');
        }
    }

    // ── Bau-Ansicht und Editor ──────────────────────────────────────────────
    function spOptionen(liste, aktuell, l) {
        const raus = [];
        const gesehen = new Set();
        (liste || []).forEach(x => {
            const n = (x && x.name) || '';
            if (!n || gesehen.has(n)) return;
            gesehen.add(n);
            const pct = (x && typeof x.pct === 'number') ? ` (${String(x.pct).replace('.', ',')} %)` : '';
            raus.push(`<option value="${escapeHtml(n)}"${n === aktuell ? ' selected' : ''}>${escapeHtml(n + pct)}</option>`);
        });
        if (aktuell && !gesehen.has(aktuell)) {
            raus.unshift(`<option value="${escapeHtml(aktuell)}" selected>${escapeHtml(aktuell)}</option>`);
        }
        raus.unshift(`<option value=""${aktuell ? '' : ' selected'}>—</option>`);
        return raus.join('');
    }

    function setKarte(slug, l) {
        const st = _sets[slug] || standardSet(slug);
        const CSx = CS();
        const moves = (st.moves || []).filter(Boolean);
        return `<div class="sqb-set" data-set="${escapeHtml(slug)}">
            <div class="sqb-set-head">
                ${icon(slug)}
                <div class="sqb-set-title">
                    <strong>${escapeHtml(displayName(slug))}</strong>
                    <span class="sqb-set-item">${escapeHtml(st.item || '—')}</span>
                </div>
                <button type="button" class="sqb-edit" data-edit="${escapeHtml(slug)}">${escapeHtml(l.bearbeiten)}</button>
            </div>
            <dl class="sqb-set-grid">
                <dt>${escapeHtml(l.faehigkeit)}</dt><dd>${escapeHtml(st.ability || '—')}</dd>
                <dt>${escapeHtml(l.wesen)}</dt><dd>${escapeHtml(st.nature || '—')}</dd>
                <dt>${escapeHtml(l.punkte)}</dt><dd class="sqb-set-sp">${escapeHtml(CSx.toChampionsText(st.sp) || '—')}</dd>
                <dt>${escapeHtml(l.attacken)}</dt><dd>${moves.length ? escapeHtml(moves.join(' · ')) : '—'}</dd>
            </dl>
            ${st.sicher ? '' : `<p class="sqb-warn">${escapeHtml(l.nameUnklar)}</p>`}
        </div>`;
    }

    function bauHtml(l) {
        const ueber = ueberschussGesamt();
        return `<div class="sqb sqb--bau">
            <div class="sqb-bau-top">
                <button type="button" class="sqb-back">${escapeHtml(l.zurueckZurAuswahl)}</button>
                <h4 class="sqb-sec">${escapeHtml(l.bauTitel)}</h4>
            </div>
            <div class="sqb-sets">${_team.map(sl => setKarte(sl, l)).join('')}</div>
            <div class="sqb-save">
                <input type="text" class="sqb-name" placeholder="${escapeHtml(l.namePh)}"
                       value="${escapeHtml(_teamName)}" maxlength="60" aria-label="${escapeHtml(l.namePh)}">
                <div class="sqb-save-btns">
                    <button type="button" class="sqb-do-save">${escapeHtml(l.speichern)}</button>
                    <button type="button" class="sqb-do-active">${escapeHtml(l.aktivSetzen)}</button>
                </div>
            </div>
            <div class="sqb-export">
                <div class="sqb-export-btns">
                    <button type="button" class="sqb-exp" data-mode="limitless">${escapeHtml(l.exportL)}</button>
                    <button type="button" class="sqb-exp" data-mode="showdown">${escapeHtml(l.exportS)}</button>
                </div>
                ${ueber ? `<p class="sqb-warn">${escapeHtml(l.evWarnung(ueber))}</p>` : ''}
                <textarea class="sqb-paste" readonly rows="10" spellcheck="false"></textarea>
            </div>
            <p class="sqb-attr">${escapeHtml(l.attribution)}</p>
        </div>`;
    }

    function editorHtml(slug, l) {
        const st = _sets[slug];
        const b = block2(slug);
        const CSx = CS();
        const summe = CSx.spreadTotal(st.sp);
        const naturen = (b.nature || []).length ? b.nature : null;
        const regler = CSx.KEYS.map(k => {
            const kurz = uiLang() === 'de' ? CSx.LABEL_DE[k] : CSx.LABEL[k];
            return `<label class="sqb-sp-row">
                <span class="sqb-sp-key">${escapeHtml(kurz)}</span>
                <input type="range" class="sqb-sp" data-k="${k}" min="0" max="${CSx.SP_MAX}" step="1" value="${st.sp[k]}">
                <output class="sqb-sp-val" data-out="${k}">${st.sp[k]}</output>
            </label>`;
        }).join('');
        const attacken = [0, 1, 2, 3].map(i =>
            `<select class="sqb-move" data-i="${i}" aria-label="${escapeHtml(l.attacken)} ${i + 1}">
                ${spOptionen(b.move, (st.moves || [])[i] || '', l)}
             </select>`).join('');
        const leer = !(b.move || []).length && !(b.held_item || []).length;
        return `<div class="sqb-modal" id="sqbSetModal" role="dialog" aria-modal="true">
            <div class="sqb-modal-box">
                <div class="sqb-modal-head">
                    <h3>${escapeHtml(l.modalTitel(displayName(slug)))}</h3>
                    <button type="button" class="sqb-modal-x" aria-label="×">×</button>
                </div>
                ${leer ? `<p class="sqb-warn">${escapeHtml(l.keineDaten)}</p>` : ''}
                <div class="sqb-modal-body">
                    <label class="sqb-field"><span>${escapeHtml(l.faehigkeit)}</span>
                        <select class="sqb-ability">${spOptionen(b.ability, st.ability, l)}</select></label>
                    <label class="sqb-field"><span>${escapeHtml(l.item)}</span>
                        <select class="sqb-item">${spOptionen(b.held_item, st.item, l)}</select></label>
                    <label class="sqb-field"><span>${escapeHtml(l.wesen)}</span>
                        <select class="sqb-nature">${spOptionen(naturen, st.nature, l)}</select></label>
                    <div class="sqb-field sqb-field--moves"><span>${escapeHtml(l.attacken)}</span>
                        <div class="sqb-moves">${attacken}</div></div>
                    <div class="sqb-field sqb-field--sp">
                        <span>${escapeHtml(l.punkte)}
                            <em class="sqb-budget${summe >= CSx.SP_BUDGET ? ' is-full' : ''}">${escapeHtml(l.budget(summe, CSx.SP_BUDGET))}</em>
                        </span>
                        <p class="sqb-hint">${escapeHtml(l.punkteHint(CSx.SP_BUDGET, CSx.SP_MAX))}</p>
                        <div class="sqb-sp-grid">${regler}</div>
                    </div>
                </div>
                <div class="sqb-modal-foot">
                    <button type="button" class="sqb-reset">${escapeHtml(l.standard)}</button>
                    <button type="button" class="sqb-done">${escapeHtml(l.fertig)}</button>
                </div>
            </div>
        </div>`;
    }

    function closeEditor() {
        const el = document.getElementById('sqbSetModal');
        if (el) el.remove();
        document.removeEventListener('keydown', onEditorKey);
        _editSlug = null;
    }
    function onEditorKey(e) { if (e.key === 'Escape') closeEditor(); }

    function openEditor(slug) {
        if (!_sets[slug]) _sets[slug] = standardSet(slug);
        closeEditor();
        _editSlug = slug;
        const l = t();
        document.body.insertAdjacentHTML('beforeend', editorHtml(slug, l));
        const box = document.getElementById('sqbSetModal');
        if (!box) return;
        document.addEventListener('keydown', onEditorKey);
        box.addEventListener('click', e => { if (e.target === box) closeEditor(); });
        box.querySelector('.sqb-modal-x').addEventListener('click', closeEditor);
        box.querySelector('.sqb-done').addEventListener('click', () => { closeEditor(); render(); });
        box.querySelector('.sqb-reset').addEventListener('click', () => {
            _sets[slug] = standardSet(slug);
            openEditor(slug);
        });
        const st = _sets[slug];
        const CSx = CS();
        box.querySelector('.sqb-ability').addEventListener('change', e => { st.ability = e.target.value; });
        box.querySelector('.sqb-item').addEventListener('change', e => { st.item = e.target.value; });
        box.querySelector('.sqb-nature').addEventListener('change', e => { st.nature = e.target.value; });
        box.querySelectorAll('.sqb-move').forEach(sel => {
            sel.addEventListener('change', e => {
                const i = Number(e.target.getAttribute('data-i'));
                st.moves = st.moves || [];
                st.moves[i] = e.target.value;
            });
        });
        // Die Regler rechnen live gegen das Budget. clampSpread schneidet den
        // Ueberschuss ab, statt ihn umzuverteilen — deshalb muss die Anzeige
        // danach zurueckgeschrieben werden, sonst zeigt der Regler 32 und der
        // Bau traegt 12.
        const budgetEl = box.querySelector('.sqb-budget');
        box.querySelectorAll('.sqb-sp').forEach(inp => {
            inp.addEventListener('input', () => {
                const roh = Object.assign({}, st.sp);
                roh[inp.getAttribute('data-k')] = Number(inp.value);
                st.sp = CSx.clampSpread(roh);
                CSx.KEYS.forEach(k => {
                    const r = box.querySelector(`.sqb-sp[data-k="${k}"]`);
                    const o = box.querySelector(`[data-out="${k}"]`);
                    if (r) r.value = st.sp[k];
                    if (o) o.textContent = st.sp[k];
                });
                const summe = CSx.spreadTotal(st.sp);
                if (budgetEl) {
                    budgetEl.textContent = t().budget(summe, CSx.SP_BUDGET);
                    budgetEl.classList.toggle('is-full', summe >= CSx.SP_BUDGET);
                }
            });
        });
    }

    function render() {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const l = t();

        if (_gesetzt && _team.length) {
            host.innerHTML = bauHtml(l);
            wireBau(host, l);
            return;
        }

        const chips = _team.length
            ? _team.map(slug =>
                `<button type="button" class="sqb-chip" data-remove="${escapeHtml(slug)}" title="${escapeHtml(l.remove)}">
                    ${icon(slug)}<span class="sqb-chip-name">${escapeHtml(displayName(slug))}</span><span class="sqb-chip-x">×</span>
                </button>`).join('')
            : `<span class="sqb-empty">${escapeHtml(l.empty)}</span>`;

        host.innerHTML = `
            <div class="sqb">
                <p class="sqb-intro">${escapeHtml(l.intro)}</p>
                <div class="sqb-team-bar">
                    <div class="sqb-chips">${chips}</div>
                    <div class="sqb-team-bar-meta">
                        <span class="sqb-count">${escapeHtml(l.picked(_team.length))}</span>
                        ${_team.length ? `<button type="button" class="sqb-clear">${escapeHtml(l.clear)}</button>` : ''}
                    </div>
                </div>
                <div class="sqb-searchwrap">
                    <input type="search" class="sqb-search" placeholder="${escapeHtml(l.searchPh)}"
                           value="${escapeHtml(_query)}" autocomplete="off" spellcheck="false"
                           aria-label="${escapeHtml(l.searchPh)}">
                </div>
                <h4 class="sqb-sec">${escapeHtml(l.suggestTitle)}</h4>
                <p class="sqb-hint">${escapeHtml(_team.length ? l.suggestHint : l.suggestHintFirst)}</p>
                <div class="sqb-suggs">${suggestionsHtml(l)}</div>
                ${_team.length ? `<div class="sqb-setzen-wrap">
                    <button type="button" class="sqb-setzen">${escapeHtml(l.setzen)}</button>
                    <p class="sqb-hint">${escapeHtml(l.setzenHint)}</p>
                </div>` : ''}
                <p class="sqb-attr">${escapeHtml(l.attribution)}</p>
            </div>`;
        wire(host);
    }

    function wire(host) {
        const search = host.querySelector('.sqb-search');
        if (search) {
            search.addEventListener('input', () => {
                _query = search.value;
                const box = host.querySelector('.sqb-suggs');
                if (box) { box.innerHTML = suggestionsHtml(t()); wireSuggs(box); }
            });
        }
        wireSuggs(host);
        host.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => removeMon(b.getAttribute('data-remove'))));
        const clr = host.querySelector('.sqb-clear'); if (clr) clr.addEventListener('click', clearAll);
        const setzen = host.querySelector('.sqb-setzen'); if (setzen) setzen.addEventListener('click', setzeTeam);
    }

    function wireBau(host, l) {
        const zurueck = host.querySelector('.sqb-back');
        if (zurueck) zurueck.addEventListener('click', () => { _gesetzt = false; render(); });
        host.querySelectorAll('[data-edit]').forEach(b =>
            b.addEventListener('click', () => openEditor(b.getAttribute('data-edit'))));
        const name = host.querySelector('.sqb-name');
        if (name) name.addEventListener('input', () => { _teamName = name.value; });
        const save = host.querySelector('.sqb-do-save');
        if (save) save.addEventListener('click', () => speichere(l));
        const akt = host.querySelector('.sqb-do-active');
        if (akt) akt.addEventListener('click', () => aktivSetzen(l));
        host.querySelectorAll('.sqb-exp').forEach(b => {
            b.addEventListener('click', () => {
                const text = pasteText(b.getAttribute('data-mode') === 'showdown');
                const ta = host.querySelector('.sqb-paste');
                if (ta) ta.value = text;
                kopiere(text, l);
            });
        });
    }
    function wireSuggs(scope) {
        scope.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addMon(b.getAttribute('data-add'))));
    }

    let _activated = false;
    async function activate() {
        const host = document.getElementById(HOST_ID);
        if (host && !_loaded) host.innerHTML = '<p class="sqb-loading">…</p>';
        await Promise.all([load(), loadDe(), loadDex()]);
        _activated = true;
        render();
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById(HOST_ID);
        if (_activated && host && !host.hidden) render();
    });

    window.sideQuestBuilder = { activate };
    // Nur fuer die Zusicherungen: reine Funktionen ohne DOM, damit
    // tests/unit sie fahren kann, ohne den halben Browser nachzubauen.
    window._sqBuilderInternals = {
        standardSet: standardSet,
        alsTeamObjekt: alsTeamObjekt,
        pasteText: pasteText,
        setState: function (team, raw, dex, sets) {
            _team = team || []; _raw = raw || {}; _dex = dex || {};
            _dexLoaded = true; _sets = sets || {};
        }
    };
})();
