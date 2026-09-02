// ── Side Quest · Champions — Resources / Nachschlagen ──────────────
// A searchable reference of the items, abilities and moves that show
// up in the Pokémon Champions doubles meta. Built on the verified
// reference files that the (now-disabled) strategy generator used as
// fact blocks:
//   data/champions_items_reference.json      { items:      {EN: {de_name, effect}} }
//   data/champions_abilities_reference.json   { abilities:  {EN: {de_name, effect}} }
//   data/champions_moves_reference.json       { moves:      {EN: {de_name, type, effect}} }
//
// Beginner-first: type a German name, English name or keyword and get
// the verified mechanic explanation. A "Feldeffekte" filter collects
// the weather / terrain / room / screen setters + extenders that drive
// so much of VGC doubles.
(function () {
    'use strict';

    const RESOURCES_URL = 'data/champions_resources.json';

    let _entries = null;       // [{cat, en, de, type, en_effect, de_effect, field, verified}]
    let _loading = null;
    let _activated = false;    // lazy: only fetch on first Resources view
    let _query = '';
    let _filter = 'all';       // all | item | ability | move | field
    let _champOnly = true;     // show only entries available in Champions

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }

    const LABELS = {
        de: {
            stufeTitel: (stufe, pct) => `Stufe ${stufe} \u2014 der Wert liegt danach bei ${pct} des Ausgangswerts. Klick fuer die ganze Tabelle.`,
            tabTeams:    'Teams',
            tabResources:'Nachschlagen',
            heading:     'Nachschlagewerk',
            intro:       'Items, Fähigkeiten und Attacken aus dem Champions-Doppelkampf-Meta — auf Deutsch, Englisch oder per Stichwort suchen.',
            searchPh:    '🔎 Suche: „Rückenwind", „Tailwind", „Sonne", „Wahlschal" …',
            fAll:        'Alle',
            fItem:       'Items',
            fAbility:    'Fähigkeiten',
            fMove:       'Attacken',
            fField:      'Feldeffekte',
            catItem:     'Item',
            catAbility:  'Fähigkeit',
            catMove:     'Attacke',
            fieldTag:    'Feld',
            verifiedHint:'Deutsche Beschreibung handgeprüft',
            noEffect:    'Keine Beschreibung hinterlegt.',
            none:        'Nichts gefunden — andere Schreibweise oder Stichwort probieren.',
            champOnly:    'Nur in Champions',
            champNote:    'Zeigt nur Items/Fähigkeiten/Attacken, die in Pokémon Champions verfügbar sind.',
            loading:     'Lade Referenzdaten …',
            error:       'Referenzdaten konnten nicht geladen werden.',
            count:       (n) => `${n} Einträge`,
            statPower:   'Stärke',
            statAcc:     'Genauigkeit',
            statPP:      'AP',
            statPrio:    'Prio',
            dmgPhysical: 'Physisch',
            dmgSpecial:  'Speziell',
            dmgStatus:   'Status',
            attribution: 'Daten: Pokémon-Champions-Datensatz (CC BY 4.0) · Deutsche Texte: PokéAPI',
        },
        en: {
            stufeTitel: (stufe, pct) => `Stage ${stufe} \u2014 the stat then sits at ${pct} of its base. Click for the full table.`,
            tabTeams:    'Teams',
            tabResources:'Look up',
            heading:     'Reference',
            intro:       'Items, abilities and moves from the Champions doubles meta — search in German, English or by keyword.',
            searchPh:    '🔎 Search: "Tailwind", "Rückenwind", "sun", "Choice Scarf" …',
            fAll:        'All',
            fItem:       'Items',
            fAbility:    'Abilities',
            fMove:       'Moves',
            fField:      'Field effects',
            catItem:     'Item',
            catAbility:  'Ability',
            catMove:     'Move',
            fieldTag:    'Field',
            verifiedHint:'German description hand-checked',
            noEffect:    'No description available yet.',
            none:        'Nothing found — try a different spelling or keyword.',
            champOnly:    'Champions only',
            champNote:    'Shows only items/abilities/moves available in Pokémon Champions.',
            loading:     'Loading reference data …',
            error:       'Could not load reference data.',
            count:       (n) => `${n} entries`,
            statPower:   'Power',
            statAcc:     'Accuracy',
            statPP:      'PP',
            statPrio:    'Prio',
            dmgPhysical: 'Physical',
            dmgSpecial:  'Special',
            dmgStatus:   'Status',
            attribution: 'Data: Pokémon Champions dataset (CC BY 4.0) · German text: PokéAPI',
        },
    };
    function t() { return LABELS[uiLang()]; }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadData() {
        if (_entries) return Promise.resolve(_entries);
        if (_loading) return _loading;
        _loading = fetch(`${RESOURCES_URL}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                _entries = (json && Array.isArray(json.entries)) ? json.entries : [];
                return _entries;
            })
            .catch(() => { _entries = []; return _entries; });
        return _loading;
    }

    // Effect text in the UI language, falling back to the other language
    // (PokéAPI sometimes only has one). '' when neither exists.
    function effectFor(e) {
        const lang = uiLang();
        const primary = lang === 'de' ? e.de_effect : e.en_effect;
        const other   = lang === 'de' ? e.en_effect : e.de_effect;
        return (primary && primary.trim()) ? primary : (other || '');
    }

    // ── Filtering / search ─────────────────────────────────────────
    function norm(s) { return String(s || '').toLowerCase(); }

    // Extra searchable aliases keyed by normalized EN name — common old / colloquial
    // German names people still search by. "Finte" was the German name of the
    // long-removed move Faint Attack; users often expect it to find Feint
    // (now officially "Offenlegung"), so map it here.
    const SEARCH_ALIASES = {
        feint: 'finte',
    };

    function matches(e, q) {
        if (!q) return true;
        // Search both languages' names AND effects so "tailwind" finds it
        // from a German UI and "rückenwind" finds it from an English one.
        const hay = norm(e.en) + ' ' + norm(e.de) + ' ' +
                    norm(e.en_effect) + ' ' + norm(e.de_effect) + ' ' + norm(e.type) +
                    ' ' + (SEARCH_ALIASES[norm(e.en)] || '');
        return q.split(/\s+/).every(tok => hay.indexOf(tok) !== -1);
    }

    function currentResults() {
        if (!_entries) return [];
        const q = norm(_query).trim();
        const lang = uiLang();
        return _entries
            .filter(e => !_champOnly || e.champ !== false)   // Champions-availability gate
            .filter(e => _filter === 'all' ? true : (_filter === 'field' ? e.field : e.cat === _filter))
            .filter(e => matches(e, q))
            .sort((a, b) => {
                const ka = lang === 'de' ? a.de : a.en;
                const kb = lang === 'de' ? b.de : b.en;
                return ka.localeCompare(kb, lang);
            });
    }

    function counts() {
        const c = { all: 0, item: 0, ability: 0, move: 0, field: 0 };
        (_entries || [])
            .filter(e => !_champOnly || e.champ !== false)
            .forEach(e => { c.all++; c[e.cat]++; if (e.field) c.field++; });
        return c;
    }

    // ── Render ─────────────────────────────────────────────────────
    function typeBadge(type) {
        if (!type) return '';
        return `<span class="sq-res-type sq-play-type-${escapeHtml(type.toLowerCase())}">${escapeHtml(type)}</span>`;
    }

    function catLabel(cat) {
        const l = t();
        return cat === 'item' ? l.catItem : cat === 'ability' ? l.catAbility : l.catMove;
    }

    // Champions-verified move stats line (power / accuracy / PP / damage
    // class). Status moves have no power → "—"; never-miss moves have no
    // accuracy → "—". Only rendered for moves that carry any of these.
    function moveStatsHtml(e, l) {
        if (e.cat !== 'move') return '';
        const hasPrio = e.priority != null && Number(e.priority) !== 0;
        const has = e.power != null || e.accuracy != null || e.pp != null || e.damage_class || hasPrio;
        if (!has) return '';
        const dash = '—';
        const dmg = e.damage_class === 'Physical' ? l.dmgPhysical
                  : e.damage_class === 'Special'  ? l.dmgSpecial
                  : e.damage_class === 'Status'   ? l.dmgStatus : '';
        // power 0 = status move → show "—" rather than "0"; missing accuracy
        // = never-miss / status → "—".
        const hasPower = e.power != null && Number(e.power) > 0;
        const parts = [
            `<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statPower)}</span> <b>${hasPower ? escapeHtml(String(e.power)) : dash}</b></span>`,
            `<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statAcc)}</span> <b>${e.accuracy != null ? escapeHtml(String(e.accuracy)) : dash}</b></span>`,
        ];
        if (e.pp != null) parts.push(`<span class="sq-res-stat"><span class="sq-res-stat-k">${escapeHtml(l.statPP)}</span> <b>${escapeHtml(String(e.pp))}</b></span>`);
        // Only shown when non-zero — a positive/negative priority is the meaningful
        // case (Fake Out +3, Feint +2, Trick Room −7); priority 0 is the default.
        if (hasPrio) {
            const p = Number(e.priority);
            const sign = p > 0 ? `+${p}` : String(p).replace('-', '−');
            parts.push(`<span class="sq-res-stat sq-res-stat-prio"><span class="sq-res-stat-k">${escapeHtml(l.statPrio)}</span> <b>${escapeHtml(sign)}</b></span>`);
        }
        if (dmg) parts.push(`<span class="sq-res-stat sq-res-stat-dmg">${escapeHtml(dmg)}</span>`);
        return `<div class="sq-res-movestats">${parts.join('')}</div>`;
    }

    /* „Der Angriff steigt stark" — und wie viel ist das?

       Die Stufentabelle steht im Reiter „Statuszustaende". Von den
       Attackentexten aus war sie nicht zu finden: wer „senkt stark"
       liest, weiss weiterhin nicht, ob das die Haelfte oder ein Drittel
       ist. Die Zahl steht jetzt dort, wo das Wort steht.

       ── WOHER DIE ZAHL KOMMT, UND WOHER NICHT ──────────────────────

       Ein erster Entwurf las die Stufe aus dem DEUTSCHEN Text ab
       ("stark" = 2, "drastisch" = 3). Die Abnahme am 02.09.2026 hat ihn
       zerlegt, und zwar zu Recht:

         · Er lief ueber alle 1268 Eintraege, nicht nur ueber die 494
           Attacken. 84 Item- und Faehigkeitstexte trugen eine Marke, die
           niemand geprueft hatte.
         · Vier Faehigkeiten trugen die UMKEHRUNG ihrer Aussage:
           "Hindert Angreifer daran, die Verteidigung zu senken" bekam
           "-1 · 66,7 %".
         · Aus Multiplikatoren wurden Stufen: Leben-Orb "erhoeht den
           Schaden um 30 %" bekam "+1 · 150 %".
         · Fadenschuss zeigte je nach Sprachschalter -1 oder -2 — dieselbe
           Attacke, zwei Zahlen.

       Die Ursache war nicht ein Fehler, sondern der Ansatz: deutscher
       Fliesstext ist keine verlaessliche Quelle fuer eine Zahl.

       Der englische Text ist es. Er ist formelhaft — "Raises the user's
       Speed by 2 stages.", "Has a 100% chance to lower the target's
       Attack by 1 stage." — und nennt die Stufenzahl ausdruecklich. Die
       Zahl kommt deshalb IMMER von dort, in beiden Sprachfassungen.

       Der deutsche Text wird nur noch benutzt, um die Marke zu
       PLATZIEREN, nie um sie zu berechnen. Findet sich dort nicht genau
       ein Richtungswort mit passendem Vorzeichen, bleibt der deutsche
       Text unmarkiert — die Zahl waere richtig, aber niemand wuesste,
       auf welchen der beiden Effekte sie sich bezieht.

       ── WAS AUSDRUECKLICH KEINE MARKE BEKOMMT ──────────────────────

         · alles ausser Attacken (cat !== 'move')
         · Texte mit mehr als einer Stufenangabe — dann ist unklar,
           welche gemeint ist
         · Genauigkeit, Fluchtwert und Volltrefferquote: die folgen laut
           den Daten selbst einer eigenen, flacheren Tabelle, deren
           Zwischenwerte dort ausdruecklich NICHT belegt sind

       Eine erfundene Zahl ist schlimmer als keine. */

    // "raises ... by 2 stages" / "lowers ... by 1 stage". Der Punkt und
    // das Semikolon begrenzen, damit sich die Angabe nicht ueber zwei
    // Saetze zieht.
    /* Auch die Partizip- und Verlaufsformen (Abnahme 02.09.2026):
       "lowering the Speed by 1 stage" (Klebenetz), "have their Attack
       lowered by 1 stage" (Koenigsschild). Dieselbe formelhafte
       Struktur, nur eine andere Wortform — sie zu uebergehen hiess,
       richtige Zahlen wegzulassen.

       `by` ist wahlfrei, weil ein einziger Text es weglaesst
       ("Raises the Attack of the user and all allies 1 stage.",
       Heulschrei). Die Zahl vor "stage(s)" traegt die Aussage auch
       ohne das Wort. */
    const EN_STUFE = /\b(raise|raises|raising|raised|lower|lowers|lowering|lowered)\b([^.;]*?)\b(?:by\s+)?(one|two|three|1|2|3)\s+stages?\b/gi;
    const EN_ZAHL = { one: 1, two: 2, three: 3, '1': 1, '2': 2, '3': 3 };

    /* Genauigkeit, Fluchtwert und Volltrefferquote folgen NICHT dieser
       Tabelle — das steht in data/champions_statuszustaende.json selbst:

         gilt_fuer  "Angriff, Verteidigung, Spezial-Angriff,
                     Spezial-Verteidigung und Initiative"
         ausnahme   "Genauigkeit und Fluchtwert folgen einer eigenen,
                     flacheren Tabelle ... Die Zwischenwerte stehen hier
                     nicht, weil wir sie nicht Stufe fuer Stufe belegt
                     haben."

       Gemessen: zehn Attacken haetten sonst eine Zahl aus der falschen
       Tabelle getragen. */
    const AUSNAHME = /\b(evasi\w*|accuracy|critical hit)\b/i;

    // Nur zum PLATZIEREN im deutschen Text — nie zum Rechnen.
    const DE_RICHTUNG = /\b(erhöht|erhöhen|senkt|senken|steigt|steigen|sinkt|sinken|reduziert|verringert)\b/gi;

    /* Die eine Stufenzahl eines Attackentextes — oder null.

       null heisst: keine, mehr als eine, oder eine aus der anderen
       Tabelle. In allen drei Faellen wird nichts markiert. */
    /* Redet der Satz ueber eine ANDERE Attacke?

       BEFUND (Abnahme 02.09.2026): Nebelfeld und Psychofeld tragen im
       englischen Text den Satz "... and Secret Power has a 30% chance to
       lower Special Attack by 1 stage." Das ist eine Aussage ueber
       Kraftreserve, nicht ueber das Feld — die Marke sass am falschen
       Eintrag. Lokal war sie wahr und deshalb besonders schwer zu sehen.

       Geprueft wird gegen die Namen der anderen Attacken aus derselben
       Datei, nicht gegen eine hier gepflegte Liste: zwei Listen waeren
       zwei Wahrheiten, und diese eine ist ohnehin schon da. */
    function fremdeAttacke(satz, eigenerName) {
        const alle = _entries || [];
        for (let i = 0; i < alle.length; i++) {
            const e = alle[i];
            if (e.cat !== 'move' || !e.en || e.en === eigenerName) continue;
            // Kurze Namen wie "Rest" oder "Bind" stehen zu oft als
            // gewoehnliches Wort im Text; erst ab zwei Woertern oder
            // sechs Zeichen ist ein Treffer aussagekraeftig.
            if (e.en.length < 6 && e.en.indexOf(' ') === -1) continue;
            if (satz.indexOf(e.en) !== -1) return e.en;
        }
        return null;
    }

    function stufeAusEnglisch(enText, eigenerName) {
        const text = enText || '';
        EN_STUFE.lastIndex = 0;
        let m, gefunden = null, anzahl = 0;
        while ((m = EN_STUFE.exec(text)) !== null) {
            anzahl++;
            if (AUSNAHME.test(m[0])) return null;
            // Der Satz um die Fundstelle.
            const von = Math.max(0, text.lastIndexOf('.', m.index) + 1);
            let bis = text.indexOf('.', m.index + m[0].length);
            if (bis === -1) bis = text.length;
            if (fremdeAttacke(text.slice(von, bis), eigenerName)) return null;
            const n = EN_ZAHL[String(m[3]).toLowerCase()] || 1;
            gefunden = /^raise/i.test(m[1]) ? n : -n;
        }
        return anzahl === 1 ? gefunden : null;
    }

    /* Wo im Text die Marke sitzt.

       Englisch: auf der Stufenangabe selbst ("by 2 stages") — dort steht
       die Aussage, und die Zahl zerreisst den Satz nicht.
       Deutsch: auf dem einen Richtungswort, sofern es genau eins mit
       passendem Vorzeichen gibt. */
    function stufenTreffer(text, de, stufe) {
        if (stufe == null || !text) return [];
        if (!de) {
            EN_STUFE.lastIndex = 0;
            const m = EN_STUFE.exec(text);
            if (!m) return [];
            /* Markiert wird die Stufenangabe am Ende ("by 2 stages"),
               nicht das Richtungswort am Anfang — sonst stuende die Zahl
               mitten im Satz. Fehlt das "by", faengt die Marke bei der
               Zahl an. */
            const ganz = m[0];
            const rel = ganz.toLowerCase().lastIndexOf('by ');
            const zahlRel = ganz.search(/\b(one|two|three|1|2|3)\s+stages?\b/i);
            const von = m.index + (rel >= 0 ? rel : (zahlRel >= 0 ? zahlRel : 0));
            return [{ von, bis: m.index + ganz.length,
                      wort: text.slice(von, m.index + ganz.length), stufe }];
        }
        DE_RICHTUNG.lastIndex = 0;
        const alle = [];
        let d;
        while ((d = DE_RICHTUNG.exec(text)) !== null) {
            const auf = /^(erh|steig)/i.test(d[1]);
            alle.push({ von: d.index, bis: d.index + d[1].length, wort: d[1], auf });
        }
        if (alle.length !== 1) return [];
        if (alle[0].auf !== (stufe > 0)) return [];
        return [{ von: alle[0].von, bis: alle[0].bis, wort: alle[0].wort, stufe }];
    }

    let _stufen = null;          // stufe -> { prozent_de, prozent_en, bruch }
    let _stufenAngefragt = false;
    function stufenGeladen() {
        const roh = window.SideQuestStufen;
        if (!roh || !Array.isArray(roh)) {
            /* Noch nicht da: einmal anfordern und danach neu zeichnen.
               Ohne das haengt die Zahl davon ab, ob jemand vorher den
               Reiter "Statuszustaende" geoeffnet hat — und der Text
               saehe fuer zwei Leute verschieden aus. */
            if (!_stufenAngefragt && window.sideQuestStatus
                && typeof window.sideQuestStatus.stufen === 'function') {
                _stufenAngefragt = true;
                window.sideQuestStatus.stufen().then(function (t) {
                    if (t && t.length) { _stufen = null; render(); }
                });
            }
            return null;
        }
        if (_stufen) return _stufen;
        _stufen = {};
        roh.forEach(z => { _stufen[Number(z.stufe)] = z; });
        return _stufen;
    }

    /* Nimmt den ROHEN Effekttext und gibt HTML zurueck. Der Text wird
       stueckweise escaped — nie der zusammengesetzte String, sonst wuerde
       die eigene Auszeichnung mit escaped. */
    function mitStufenzahl(text, eintrag) {
        // Nur Attacken. Faehigkeiten und Items reden ueber Multiplikatoren
        // und ueber das VERHINDERN von Senkungen; beides ist keine Stufe.
        if (!eintrag || eintrag.cat !== 'move') return escapeHtml(text);
        const tab = stufenGeladen();
        if (!tab) return escapeHtml(text);
        const stufe = stufeAusEnglisch(eintrag.en_effect, eintrag.en);
        if (stufe == null) return escapeHtml(text);
        const z = tab[stufe];
        if (!z) return escapeHtml(text);

        /* Welche Sprache der TEXT hat, nicht welche die Oberflaeche hat
           (Abnahme 02.09.2026). Zwoelf Attacken haben keinen deutschen
           Text; effectFor() faellt dort auf den englischen zurueck. Nach
           der Oberflaeche zu entscheiden hiess: derselbe englische
           Satz trug im englischen UI eine Marke und im deutschen keine. */
        const zeigtDeutsch = !!(eintrag.de_effect && eintrag.de_effect.trim())
            && text === eintrag.de_effect;
        const treffer = stufenTreffer(text, zeigtDeutsch, stufe);
        const de = uiLang() === 'de';
        if (!treffer.length) return escapeHtml(text);

        const l = t();
        const pct = de ? z.prozent_de : z.prozent_en;
        const vz = stufe > 0 ? '+' : '';
        const tr = treffer[0];
        return escapeHtml(text.slice(0, tr.von))
            + `<a class="sq-res-stufe" href="#side-quest-stufen"`
            + ` data-sq-stufe="${escapeHtml(String(stufe))}"`
            + ` title="${escapeHtml(l.stufeTitel(vz + stufe, pct))}"`
            + `>${escapeHtml(tr.wort)}<span class="sq-res-stufe-pct">${
                escapeHtml(vz + stufe + ' · ' + pct)}</span></a>`
            + escapeHtml(text.slice(tr.bis));
    }

    function renderEntry(e) {
        const lang = uiLang();
        const l = t();
        const primary   = lang === 'de' ? e.de : e.en;
        const secondary = lang === 'de' ? e.en : e.de;
        const fieldTag = e.field ? `<span class="sq-res-fieldtag">${escapeHtml(l.fieldTag)}</span>` : '';
        const verTag = e.verified
            ? `<span class="sq-res-verified" title="${escapeHtml(l.verifiedHint)}">✓</span>`
            : '';
        const eff = effectFor(e);
        const effHtml = eff
            ? mitStufenzahl(eff, e)
            : `<span class="sq-res-noeff">${escapeHtml(l.noEffect)}</span>`;
        return `
            <li class="sq-res-entry sq-res-cat-${e.cat}${e.verified ? ' is-verified' : ''}">
                <button class="sq-res-head" type="button" aria-expanded="false">
                    <span class="sq-res-names">
                        <span class="sq-res-name">${verTag}${escapeHtml(primary)}</span>
                        <span class="sq-res-name-alt">${escapeHtml(secondary)}</span>
                    </span>
                    <span class="sq-res-badges">
                        ${typeBadge(e.type)}
                        ${fieldTag}
                        <span class="sq-res-cat">${escapeHtml(catLabel(e.cat))}</span>
                        <span class="sq-res-chevron" aria-hidden="true">▾</span>
                    </span>
                </button>
                ${moveStatsHtml(e, l)}
                <div class="sq-res-effect" hidden>${effHtml}</div>
            </li>`;
    }

    function renderChips() {
        const l = t();
        const c = counts();
        const chip = (id, label) =>
            `<button class="sq-res-chip${_filter === id ? ' is-active' : ''}" type="button" data-sq-res-filter="${id}">${escapeHtml(label)} <span class="sq-res-chip-n">${c[id] || 0}</span></button>`;
        return `
            <div class="sq-res-chips" role="tablist">
                ${chip('all', l.fAll)}
                ${chip('item', l.fItem)}
                ${chip('ability', l.fAbility)}
                ${chip('move', l.fMove)}
                ${chip('field', l.fField)}
            </div>`;
    }

    function renderChampToggle() {
        const l = t();
        return `
            <div class="sq-res-champ-row">
                <button class="sq-res-champ${_champOnly ? ' is-on' : ''}" type="button"
                        data-sq-res-champ role="switch" aria-checked="${_champOnly ? 'true' : 'false'}">
                    <span class="sq-res-champ-dot" aria-hidden="true"></span>${escapeHtml(l.champOnly)}
                </button>
                <span class="sq-res-champ-note">${escapeHtml(l.champNote)}</span>
            </div>`;
    }

    function render() {
        const host = document.getElementById('sideQuestResourcesHost');
        if (!host) return;
        const l = t();

        if (!_entries) {
            host.innerHTML = `<p class="sq-res-status">${escapeHtml(l.loading)}</p>`;
            return;
        }
        if (_entries.length === 0) {
            host.innerHTML = `<p class="sq-res-status">${escapeHtml(l.error)}</p>`;
            return;
        }

        const results = currentResults();
        const listHtml = results.length
            ? `<ul class="sq-res-list">${results.map(renderEntry).join('')}</ul>`
            : `<p class="sq-res-status">${escapeHtml(l.none)}</p>`;

        host.innerHTML = `
            <div class="sq-res">
                <p class="sq-res-intro">${escapeHtml(l.intro)}</p>
                <input id="sqResSearch" class="sq-res-search" type="search"
                       placeholder="${escapeHtml(l.searchPh)}"
                       value="${escapeHtml(_query)}"
                       autocomplete="off" spellcheck="false"
                       aria-label="${escapeHtml(l.heading)}">
                ${renderChampToggle()}
                ${renderChips()}
                <p class="sq-res-count">${escapeHtml(l.count(results.length))}</p>
                ${listHtml}
                <p class="sq-res-attr">${escapeHtml(l.attribution)}</p>
            </div>`;

        wireEvents(host);
    }

    function wireEvents(host) {
        const search = host.querySelector('#sqResSearch');
        if (search) {
            search.addEventListener('input', () => {
                _query = search.value;
                rerenderResultsOnly();   // keeps input focus (input isn't repainted)
            });
        }
        host.querySelectorAll('.sq-res-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                _filter = btn.getAttribute('data-sq-res-filter') || 'all';
                render();
            });
        });
        const champBtn = host.querySelector('[data-sq-res-champ]');
        if (champBtn) champBtn.addEventListener('click', () => { _champOnly = !_champOnly; render(); });
        wireEntryButtons(host);
    }

    function toggleEffect(btn) {
        const entry = btn.closest('.sq-res-entry');
        const eff = entry && entry.querySelector('.sq-res-effect');
        if (!eff) return;
        const open = eff.hasAttribute('hidden');
        if (open) { eff.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); entry.classList.add('is-open'); }
        else      { eff.setAttribute('hidden', '');  btn.setAttribute('aria-expanded', 'false'); entry.classList.remove('is-open'); }
    }

    function wireEntryButtons(host) {
        host.querySelectorAll('.sq-res-head').forEach(btn => {
            if (btn._sqWired) return;
            btn._sqWired = true;
            btn.addEventListener('click', () => toggleEffect(btn));
        });
        /* Der Sprung zur ganzen Stufentabelle. Der href bleibt echt
           (Mittelklick, Tastatur, "Link kopieren" sollen funktionieren),
           aber der normale Klick wechselt die Ansicht selbst — sonst
           laedt die Seite neu und der aufgeklappte Effekttext ist weg. */
        host.querySelectorAll('[data-sq-stufe]').forEach(a => {
            if (a._sqWired) return;
            a._sqWired = true;
            a.addEventListener('click', (ev) => {
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                ev.preventDefault();
                ev.stopPropagation();
                showView('status');
                if (window.sideQuestStatus) window.sideQuestStatus.activate();
                // Nach dem Zeichnen scrollen, sonst gibt es das Ziel noch nicht.
                setTimeout(() => {
                    const ziel = document.getElementById('szStufenTitel');
                    if (ziel) ziel.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }, 120);
            });
        });
    }

    // Live-search repaint: only the count + list change, so we avoid a
    // full re-render that would drop input focus mid-typing.
    function rerenderResultsOnly() {
        const host = document.getElementById('sideQuestResourcesHost');
        if (!host) return;
        const l = t();
        const results = currentResults();
        const countEl = host.querySelector('.sq-res-count');
        if (countEl) countEl.textContent = l.count(results.length);
        const listHtml = results.length
            ? `<ul class="sq-res-list">${results.map(renderEntry).join('')}</ul>`
            : `<p class="sq-res-status sq-res-status--empty">${escapeHtml(l.none)}</p>`;
        const container = host.querySelector('.sq-res');
        const existing = container && (container.querySelector('.sq-res-list') || container.querySelector('.sq-res-status--empty'));
        if (existing) existing.outerHTML = listHtml;
        else if (container) container.insertAdjacentHTML('beforeend', listHtml);
        wireEntryButtons(host);
    }

    // ── Sub-tab toggle (Teams ↔ Pokémon ↔ Nachschlagen) ────────────
    // Generic over the three view hosts; the Pokédex view delegates to
    // its own module (window.sideQuestPokedex).
    const VIEW_HOSTS = {
        teams: 'sideQuestTeamsHost',
        usage: 'sideQuestUsageHost',
        matchups: 'sideQuestMatchupsHost',
        pokedex: 'sideQuestPokedexHost',
        builder: 'sideQuestBuilderHost',
        resources: 'sideQuestResourcesHost',
        // Statuszustaende, seit dem 31.08.2026. Der Host heisst
        // bewusst NICHT sideQuestStatusHost: #sideQuestStatus ist
        // schon vergeben — das ist die Ladeanzeige der Teams-Ansicht,
        // und zwei aehnliche Namen nebeneinander sind der Fehler, den
        // man erst beim Debuggen bemerkt.
        status: 'sideQuestZustaendeHost',
    };
    function showView(view) {
        if (!VIEW_HOSTS[view]) view = 'teams';
        const status = document.getElementById('sideQuestStatus');
        Object.keys(VIEW_HOSTS).forEach(v => {
            const el = document.getElementById(VIEW_HOSTS[v]);
            if (el) el.hidden = (v !== view);
        });
        if (status) status.hidden = (view !== 'teams');   // team load status is teams-only

        // The console view brings its own 46px header bar. Leaving the
        // page banner above it would stack two headers and push the first
        // number ~250px down — which is precisely the difference the
        // redesign is about. Restored for every other view.
        const banner = document.querySelector('#side-quest .header');
        if (banner) banner.hidden = (view === 'usage' || view === 'matchups');
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            b.classList.toggle('is-active', b.getAttribute('data-sq-view') === view);
            b.setAttribute('aria-selected', b.getAttribute('data-sq-view') === view ? 'true' : 'false');
        });
        // Teams war die einzige Unteransicht ohne Aktivierung. Wer von
        // "Nutzung" zurueck auf "Teams" wechselte, sah einen leeren Kasten,
        // solange der Teams-Renderer nicht schon einmal gelaufen war.
        // render() ist billig: die Daten liegen im Modul-Cache.
        if (view === 'teams') {
            if (window.sideQuest && typeof window.sideQuest.render === 'function') {
                window.sideQuest.render();
            }
        } else if (view === 'resources') {
            if (!_activated) {
                _activated = true;
                render();                 // paints the loading state
                loadData().then(render);  // then the real list
            } else {
                render();
            }
        } else if (view === 'pokedex' && window.sideQuestPokedex) {
            window.sideQuestPokedex.activate();
        } else if (view === 'builder' && window.sideQuestBuilder) {
            window.sideQuestBuilder.activate();
        } else if (view === 'usage' && window.sideQuestUsage) {
            window.sideQuestUsage.activate();
        } else if (view === 'matchups' && window.sideQuestMatchups) {
            window.sideQuestMatchups.activate();
        } else if (view === 'status' && window.sideQuestStatus) {
            window.sideQuestStatus.activate();
        }
    }

    function setSubtabLabels() {
        const l = t();
        const pokedexLabel = uiLang() === 'de' ? 'Pokémon' : 'Pokémon';
        const builderLabel = uiLang() === 'de' ? 'Team-Builder' : 'Team Builder';
        document.querySelectorAll('.side-quest-subtab').forEach(b => {
            const v = b.getAttribute('data-sq-view');
            b.textContent = v === 'usage' ? (uiLang() === 'de' ? 'Nutzung' : 'Usage')
                          : v === 'matchups' ? 'Matchups'
                          : v === 'status' ? 'Status'
                          : v === 'resources' ? l.tabResources
                          : v === 'pokedex' ? pokedexLabel
                          : v === 'builder' ? builderLabel
                          : l.tabTeams;
        });
    }

    function initSubtabs() {
        const bar = document.querySelector('.side-quest-subtabs');
        if (!bar || bar._sqWired) return;
        bar._sqWired = true;
        setSubtabLabels();
        bar.querySelectorAll('.side-quest-subtab').forEach(btn => {
            btn.addEventListener('click', () => showView(btn.getAttribute('data-sq-view') || 'teams'));
        });
    }

    document.addEventListener('DOMContentLoaded', initSubtabs);
    // The side-quest tab can be activated after DOMContentLoaded too.
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-tab-id="side-quest"], [onclick*="side-quest"]')) {
            setTimeout(initSubtabs, 0);
        }
    });
    document.addEventListener('languageChanged', () => {
        setSubtabLabels();
        const resHost = document.getElementById('sideQuestResourcesHost');
        if (_activated && resHost && !resHost.hidden) render();
    });

    // Die Statusansicht zeichnet sich bei Sprachwechsel selbst
    // (js/app-side-quest-status.js); hier steht nur der Unterreiter.

    window.sideQuestResources = { showView, render, loadData };
    /* Fuer die Tests: die Stufenerkennung einzeln pruefbar, ohne den
       ganzen Renderer und ohne DOM. */
    window._sqResIntern = {
        mitStufenzahl, stufenTreffer, stufeAusEnglisch, fremdeAttacke, EN_ZAHL,
        // Fuer die Tests: die Eintragsliste setzen, ohne zu laden.
        setEntries: (e) => { _entries = e; },
    };
})();
