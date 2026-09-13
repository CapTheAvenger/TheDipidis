/* Item-Nutzung — die Nutzungsdaten andersherum gelesen.
 *
 * Die Nutzungsansicht beantwortet "welches Item spielt dieses Pokémon".
 * Diese hier beantwortet die Gegenfrage, nach der der Betreiber am
 * 09.09.2026 gefragt hat: "welche Pokémon spielen dieses Item" — wer sind
 * die Wahlschal-Pokémon, wer spielt Leben-Orb, und bei welchen Items sind
 * es so wenige, dass man sie sich merken kann.
 *
 * DER NENNER IST DIE GANZE SCHWIERIGKEIT.
 *
 * champions_usage.json fuehrt je Pokémon eine Liste seiner Items mit einem
 * Prozentwert. Dieser Wert heisst: "so viel Prozent DER BAUTEN DIESES
 * POKÉMON halten das Item". Er heisst NICHT "so viel Prozent der Traeger
 * dieses Items sind dieses Pokémon". Die zweite Zahl steht nirgends in den
 * Daten, und sie laesst sich aus der ersten allein nicht herleiten.
 *
 * Deshalb gibt es hier zwei Sortierungen, beide beschriftet:
 *
 *   BINDUNG   der rohe Prozentwert. "Wer spielt fast immer Wahlschal?"
 *             Eine gemessene Zahl, unveraendert aus der Quelle.
 *
 *   PRAESENZ  Bindung x Team-Auftritte. "Wo begegnet mir das Item am
 *             ehesten?" Ein Produkt aus zwei gemessenen Zahlen — als
 *             Schaetzung gekennzeichnet, weil die Team-Auftritte aus 108
 *             Replica-Teams stammen und nicht aus derselben Erhebung wie
 *             die Prozentwerte.
 *
 * Was es NICHT gibt: eine Zahl "X % aller Wahlschal-Traeger". Sie waere
 * die naheliegendste und die einzige, die sich nicht belegen laesst.
 */
(function () {
    'use strict';

    const USAGE_URL = 'data/champions_usage.json';
    const TEAMS_URL = 'data/champions_replica_teams.json';
    const RES_URL = 'data/champions_resources.json';
    const POKEDEX_URL = 'data/champions_pokedex.json';

    let _usage = null, _teams = null, _res = null, _dex = null;
    let _laden = null;
    let _format = 'doubles';       // doubles | singles
    /* Voreinstellung Praesenz, nicht Bindung.
     *
     * Nach Bindung sortiert stehen oben ausschliesslich Mega-Steine:
     * Floetteonit 99,1 % bei genau einem Traeger, dann Flunkifernit,
     * Frosdedjenit, Meganienit … Das ist richtig gerechnet und als
     * erster Bildschirm wertlos — ein Mega-Stein gehoert per Spielregel
     * zu einem Pokemon, da gibt es nichts zu entdecken.
     *
     * Nach Praesenz stehen oben die Items, die einem tatsaechlich
     * begegnen: Fokusgurt, Tsitrubeere, Leben-Orb, Ueberreste,
     * Wahlschal. Bindung bleibt einen Klick entfernt fuer die andere
     * Frage — wer spielt ein Item fast immer. */
    let _sortierung = 'praesenz';  // praesenz | bindung
    let _suche = '';
    let _offen = null;             // Item-Name (EN), dessen Liste aufgeklappt ist
    let _aktiviert = false;

    const LABELS = {
        de: {
            titel: 'Item-Nutzung',
            intro: 'Welche Pokémon spielen welches Item — die Nutzungsdaten andersherum. '
                 + 'Tipp auf ein Item, um seine Träger zu sehen.',
            suche: 'Item suchen: „Wahlschal", „Choice Scarf" …',
            sortHead: 'Sortieren:',
            sBindung: 'Bindung',
            sPraesenz: 'Präsenz',
            bindungHint: 'Höchster Prozentwert eines einzelnen Pokémon. Beantwortet: '
                       + 'wer spielt das Item fast immer?',
            praesenzHint: 'Bindung × Team-Auftritte, aufsummiert. Beantwortet: wo begegnet '
                        + 'mir das Item am ehesten? Produkt aus zwei gemessenen Zahlen, '
                        + 'also eine Schätzung — die Team-Auftritte stammen aus 108 '
                        + 'Replica-Teams, nicht aus derselben Erhebung wie die Prozentwerte.',
            doubles: 'Doppelkämpfe', singles: 'Einzelkämpfe',
            traeger: (n) => n === 1 ? '1 Pokémon' : `${n} Pokémon`,
            items: (n) => `${n} Items`,
            spalteBindung: 'Anteil seiner Bauten',
            spalteAuftritte: 'Team-Auftritte',
            keineAuftritte: '—',
            nennerHinweis: 'Die Prozentzahl ist der Anteil an den Bauten DIESES Pokémon, '
                         + 'nicht sein Anteil an allen Trägern des Items.',
            schmal: 'Nur wenige Träger — gut zu merken.',
            schmalHint: 'Höchstens drei Pokémon spielen dieses Item nennenswert (ab 5 %).',
            leer: 'Nichts gefunden.',
            laden: 'Lade Nutzungsdaten …',
            fehler: 'Nutzungsdaten konnten nicht geladen werden.',
            quelle: 'Daten: championsbattledata.com (In-Game-Nutzung) · Team-Auftritte: '
                  + 'VGCPastes-Replica-Teams · Deutsche Namen: PokéAPI',
        },
        en: {
            titel: 'Item usage',
            intro: 'Which Pokémon run which item — the usage data read backwards. '
                 + 'Tap an item to see its holders.',
            suche: 'Search item: "Choice Scarf", "Life Orb" …',
            sortHead: 'Sort by:',
            sBindung: 'Commitment',
            sPraesenz: 'Presence',
            bindungHint: 'Highest single-Pokémon percentage. Answers: who runs this item '
                       + 'almost always?',
            praesenzHint: 'Commitment × team appearances, summed. Answers: where am I most '
                        + 'likely to meet this item? A product of two measured numbers, so '
                        + 'an estimate — the team appearances come from 108 replica teams, '
                        + 'not from the same survey as the percentages.',
            doubles: 'Doubles', singles: 'Singles',
            traeger: (n) => n === 1 ? '1 Pokémon' : `${n} Pokémon`,
            items: (n) => `${n} items`,
            spalteBindung: 'Share of its builds',
            spalteAuftritte: 'Team appearances',
            keineAuftritte: '—',
            nennerHinweis: 'The percentage is the share of THIS Pokémon’s builds, not '
                         + 'its share of all holders of the item.',
            schmal: 'Only a few holders — easy to remember.',
            schmalHint: 'At most three Pokémon run this item to any degree (5 % or more).',
            leer: 'Nothing found.',
            laden: 'Loading usage data …',
            fehler: 'Usage data could not be loaded.',
            quelle: 'Data: championsbattledata.com (in-game usage) · Team appearances: '
                  + 'VGCPastes replica teams · German names: PokéAPI',
        },
    };

    function uiLang() {
        return (typeof getLang === 'function' && getLang() === 'de') ? 'de' : 'en';
    }
    function t() { return LABELS[uiLang()]; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
    function z(n, k) { return Number(n).toFixed(k == null ? 1 : k).replace('.', ','); }

    function laden() {
        if (_laden) return _laden;
        const hol = (u) => fetch(`${u}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
        _laden = Promise.all([hol(USAGE_URL), hol(TEAMS_URL), hol(RES_URL), hol(POKEDEX_URL)])
            .then(([u, tm, r, d]) => {
                _usage = (u && u.pokemon) ? u.pokemon : {};
                _teams = baueTeamRang(tm);
                _res = baueItemNamen(r);
                _dex = (d && Array.isArray(d.entries)) ? d.entries : [];
                return true;
            });
        return _laden;
    }

    // Dieselbe Zuordnung wie im Raster — ein Name, eine Regel.
    const TEAM_AUSNAHMEN = { floetteeternal: 'Floette', mausholdfour: 'Maushold' };
    function nk(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    function baueTeamRang(tm) {
        const map = new Map();
        ((tm && tm.teams) || []).forEach(x => (x.pokemon || []).forEach(p => {
            const roh = p && p.name ? String(p.name).trim() : '';
            if (!roh) return;
            const k = nk(TEAM_AUSNAHMEN[nk(roh)] || roh);
            map.set(k, (map.get(k) || 0) + 1);
        }));
        return map;
    }
    function baueItemNamen(r) {
        const map = new Map();
        ((r && r.entries) || []).forEach(e => {
            if (e && e.cat === 'item' && e.en) map.set(e.en, e);
        });
        return map;
    }

    // Die Quelle liefert seit dem 13.09.2026 fuer einen Teil der
    // gehaltenen Gegenstaende keinen Namen, sondern "Unknown Item 542".
    // Ein Pseudoname liest sich wie eine Angabe und ist keine — die Regel
    // dafuer steht EINMAL in js/champions-namen.js, damit die fuenf
    // Anzeigeflaechen nicht fuenf Wahrheiten fuehren.
    function deName(en) {
        if (window.ChampionsNamen && window.ChampionsNamen.istUnbenannt
            && window.ChampionsNamen.istUnbenannt(en)) {
            return window.ChampionsNamen.anzeige(en, 'items');
        }
        const e = _res && _res.get(en);
        return (uiLang() === 'de' && e && e.de) ? e.de : en;
    }
    function wirkung(en) {
        const e = _res && _res.get(en);
        if (!e) return '';
        return (uiLang() === 'de' && e.de_effect) ? e.de_effect : (e.en_effect || '');
    }

    /* Pokédex-Eintrag zu einem Nutzungs-Slug. Die Nutzungsdatei
     * schluesselt nach slug ("hisuian-arcanine"), der Pokédex fuehrt ihn
     * in meta.slug — dieselbe Kennung, also ein sauberer Verbund ohne
     * Namensraten. */
    function eintragFuerSlug(slug) {
        if (!_dex) return null;
        const treffer = _dex.find(e => e.meta && e.meta.slug === slug);
        if (treffer) return treffer;
        // Die Nutzungsdatei haengt bei manchen Formen ein "-form" oder
        // "-variety" an ("lycanroc-dusk-form", "gourgeist-large-variety").
        // Der Pokedex fuehrt sie ohne. Gemessen 09.09.2026: 14 von 236
        // Slugs treffen exakt nicht, die Haelfte davon nur deswegen.
        const kurz = String(slug || '').replace(/-(form|variety)$/, '');
        return _dex.find(e => e.meta && e.meta.slug === kurz) || null;
    }

    /* Ein Name, den es nur einmal gibt.
     *
     * BEFUND 09.09.2026: unter "Wahlschal" standen drei Zeilen namens
     * "Rotom" untereinander — rotom, rotom-wash und rotom-mow. Der
     * Rueckfall nahm rec.name aus der Nutzungsdatei, und die fuehrt alle
     * Rotom-Formen unter demselben Namen. Drei gleiche Zeilen mit drei
     * verschiedenen Prozentwerten sehen aus wie ein Fehler, und der Leser
     * hat recht: er kann sie nicht auseinanderhalten.
     *
     * Ohne Pokedex-Eintrag wird die Form deshalb aus dem Slug ergaenzt.
     */
    function anzeigeName(slug, rec, eintrag) {
        if (eintrag) return uiLang() === 'de' ? eintrag.de : eintrag.en;
        const basis = (rec && rec.name) ? String(rec.name) : slug;
        const teile = String(slug || '').split('-');
        const form = teile.slice(1).filter(x => x !== 'form' && x !== 'variety');
        if (!form.length) return basis;
        const schoen = form.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
        return `${basis} (${schoen})`;
    }
    function auftritteFuer(eintrag) {
        if (!eintrag || !_teams) return 0;
        const en = String(eintrag.en || '');
        let m = en.match(/^(Alolan|Galarian|Hisuian|Paldean)\s+(.+)$/);
        const REG = { alolan: 'Alola', galarian: 'Galar', hisuian: 'Hisui', paldean: 'Paldea' };
        const kand = [];
        if (m) kand.push(m[2] + '-' + REG[m[1].toLowerCase()]);
        m = en.match(/^Mega\s+(.+?)(?:\s+([XY]))?$/);
        if (m) kand.push(m[1] + '-Mega' + (m[2] ? '-' + m[2] : ''));
        kand.push(en);
        for (const k of kand) { const v = _teams.get(nk(k)); if (v) return v; }
        return 0;
    }

    /* Die Umkehrung: Item -> Liste seiner Traeger. */
    function itemTabelle() {
        const items = new Map();
        Object.keys(_usage || {}).forEach(slug => {
            const rec = _usage[slug];
            const block = rec && rec[_format];
            const liste = (block && block.held_item) || [];
            liste.forEach(it => {
                if (!it || !it.name) return;
                const eintrag = eintragFuerSlug(slug);
                const zeile = {
                    slug,
                    name: anzeigeName(slug, rec, eintrag),
                    en: eintrag ? eintrag.en : (rec.name || slug),
                    pct: Number(it.pct) || 0,
                    auftritte: auftritteFuer(eintrag),
                };
                if (!items.has(it.name)) items.set(it.name, []);
                items.get(it.name).push(zeile);
            });
        });
        const raus = [];
        items.forEach((zeilen, itemEn) => {
            zeilen.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
            const bindung = zeilen.length ? zeilen[0].pct : 0;
            const praesenz = zeilen.reduce((s, x) => s + (x.pct / 100) * x.auftritte, 0);
            // "Gut zu merken": hoechstens drei Pokémon spielen es nennenswert.
            const nennenswert = zeilen.filter(x => x.pct >= 5).length;
            raus.push({ en: itemEn, de: deName(itemEn), wirkung: wirkung(itemEn),
                        zeilen, bindung, praesenz, schmal: nennenswert > 0 && nennenswert <= 3 });
        });
        return raus;
    }

    function gefiltert() {
        const q = _suche.trim().toLowerCase();
        let liste = itemTabelle();
        if (q) {
            liste = liste.filter(i =>
                i.en.toLowerCase().includes(q) || String(i.de).toLowerCase().includes(q));
        }
        liste.sort((a, b) => (_sortierung === 'praesenz'
            ? b.praesenz - a.praesenz
            : b.bindung - a.bindung) || a.de.localeCompare(b.de));
        return liste;
    }

    function traegerHtml(item) {
        const l = t();
        const zeilen = item.zeilen.map(x => `
            <tr>
                <td class="sqi-mon">${esc(x.name)}</td>
                <td class="sqi-num"><span class="sqi-bar"><i style="width:${Math.min(100, x.pct).toFixed(1)}%"></i></span>${z(x.pct)} %</td>
                <td class="sqi-num">${x.auftritte || esc(l.keineAuftritte)}</td>
            </tr>`).join('');
        return `
            <div class="sqi-traeger">
                <p class="sqi-nenner">${esc(l.nennerHinweis)}</p>
                <table class="sqi-tab">
                    <thead><tr>
                        <th>Pokémon</th>
                        <th class="sqi-num">${esc(l.spalteBindung)}</th>
                        <th class="sqi-num">${esc(l.spalteAuftritte)}</th>
                    </tr></thead>
                    <tbody>${zeilen}</tbody>
                </table>
            </div>`;
    }

    function itemHtml(item) {
        const l = t();
        const auf = _offen === item.en;
        return `
            <div class="sqi-item${auf ? ' is-offen' : ''}">
                <button type="button" class="sqi-kopf" data-sqi-item="${esc(item.en)}"
                        aria-expanded="${auf ? 'true' : 'false'}">
                    <span class="sqi-name">${esc(item.de)}</span>
                    ${item.de !== item.en ? `<span class="sqi-en">${esc(item.en)}</span>` : ''}
                    <span class="sqi-zahl">${esc(l.traeger(item.zeilen.length))}</span>
                    <span class="sqi-spitze">${z(item.bindung)} %</span>
                    ${item.schmal ? `<span class="sqi-schmal" title="${esc(l.schmalHint)}">${esc(l.schmal)}</span>` : ''}
                </button>
                ${item.wirkung ? `<p class="sqi-wirkung">${esc(item.wirkung)}</p>` : ''}
                ${auf ? traegerHtml(item) : ''}
            </div>`;
    }

    function render() {
        const host = document.getElementById('sideQuestItemsHost');
        if (!host) return;
        const l = t();
        if (!_usage) { host.innerHTML = `<p class="sqi-status">${esc(l.laden)}</p>`; return; }
        if (!Object.keys(_usage).length) {
            host.innerHTML = `<p class="sqi-status">${esc(l.fehler)}</p>`; return;
        }
        const liste = gefiltert();
        const sortBtn = (k, lab, hint) =>
            `<button type="button" class="sqi-sort${_sortierung === k ? ' is-active' : ''}"
                     data-sqi-sort="${k}" title="${esc(hint)}">${esc(lab)}</button>`;
        host.innerHTML = `
            <div class="sqi">
                <p class="sqi-intro">${esc(l.intro)}</p>
                <input id="sqiSuche" class="sqi-suche" type="search" value="${esc(_suche)}"
                       placeholder="${esc(l.suche)}" autocomplete="off" spellcheck="false">
                <div class="sqi-leiste">
                    <span class="sqi-leiste-label">${esc(l.sortHead)}</span>
                    ${sortBtn('bindung', l.sBindung, l.bindungHint)}
                    ${sortBtn('praesenz', l.sPraesenz, l.praesenzHint)}
                    <span class="sqi-spacer"></span>
                    <button type="button" class="sqi-fmt${_format === 'doubles' ? ' is-active' : ''}" data-sqi-fmt="doubles">${esc(l.doubles)}</button>
                    <button type="button" class="sqi-fmt${_format === 'singles' ? ' is-active' : ''}" data-sqi-fmt="singles">${esc(l.singles)}</button>
                </div>
                <p class="sqi-zaehler">${esc(l.items(liste.length))}</p>
                <div class="sqi-liste">${
                    liste.length ? liste.map(itemHtml).join('')
                                 : `<p class="sqi-status">${esc(l.leer)}</p>`}</div>
                <p class="sqi-quelle">${esc(l.quelle)}</p>
            </div>`;
        verdrahte(host);
    }

    function verdrahte(host) {
        const s = host.querySelector('#sqiSuche');
        if (s) s.addEventListener('input', () => { _suche = s.value; render();
            const n = document.getElementById('sqiSuche');
            if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
        host.querySelectorAll('.sqi-sort').forEach(b => b.addEventListener('click', () => {
            _sortierung = b.getAttribute('data-sqi-sort'); render();
        }));
        host.querySelectorAll('.sqi-fmt').forEach(b => b.addEventListener('click', () => {
            const f = b.getAttribute('data-sqi-fmt');
            if (f === _format) return;
            _format = f; _offen = null; render();
        }));
        host.querySelectorAll('.sqi-kopf').forEach(b => b.addEventListener('click', () => {
            const en = b.getAttribute('data-sqi-item');
            _offen = (_offen === en) ? null : en;
            render();
        }));
    }

    function activate() {
        if (!_aktiviert) {
            _aktiviert = true;
            render();
            laden().then(render);
        } else {
            render();
        }
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('sideQuestItemsHost');
        if (_aktiviert && host && !host.hidden) render();
    });

    window.sideQuestItems = { activate, render };
    window._sqItemsInternals = { itemTabelle, baueTeamRang, baueItemNamen,
        setState: (u, tm, r, d) => { _usage = u; _teams = tm; _res = r; _dex = d; },
        setFormat: (f) => { _format = f; } };
})();
