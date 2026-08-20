// app-side-quest-matchups.js — Champions matchups and damage calculator.
//
// Stufe 2, Schritte 2–4 des Briefings: ein Set-Editor als EINE Komponente,
// die Matchup-Ansicht darüber, und der Rechner mit Übergabe aus der
// Matchup-Zeile. Alle drei rechnen ausschließlich über
// window.ChampionsDamage — zwei Rechenwege sind der Grund, warum eine
// Seite 2HKO und die andere OHKO für dasselbe Paar sagt.
//
// Woher die Zahlen kommen:
//   Basiswerte      data/champions_pokedex.json
//   Attacken/Items  data/champions_resources.json (494 Attacken mit Power)
//   Sets            data/champions_usage.json (meistgenutztes Set je Format)
//   Typentabelle    data/champions_type_chart.json
//   Reihenfolge     data/champions_replica_teams.json (Team-Auftritte)
//
// Was NICHT gerechnet wird, steht auch in der Fußnote unter der Tabelle:
// Fähigkeiten, Wetter, Felder, Statusveränderungen, Volltreffer. Lieber
// eine fehlende Zahl als eine erfundene — ein falscher Schadenswert sieht
// genauso richtig aus wie ein richtiger.
(function () {
    'use strict';

    const USAGE_URL = 'champions_usage.json';
    const DEX_URL = 'champions_pokedex.json';
    const TEAMS_URL = 'champions_replica_teams.json';
    const RES_URL = 'champions_resources.json';
    const CHART_URL = 'champions_type_chart.json';
    const NAMES_DE_URL = 'champions_names_de.json';

    // Champions verteilt 66 Statuswertpunkte, höchstens 32 auf einen Wert.
    // Beides aus den echten Spreads in champions_usage.json abgelesen, nicht
    // angenommen: kein Spread der Datei überschreitet eine der Grenzen.
    const SP_MAX = 32;
    const SP_BUDGET = 66;
    const SP_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

    const ROSTER_STEP = 40;      // Matchup-Zeilen pro „mehr"-Klick

    let _dex = null;             // en -> Pokédex-Eintrag
    let _usage = null;           // slug -> Nutzungsdatensatz
    let _moves = null;           // en -> Attacken-Eintrag
    let _namesDe = null;         // { moves, items, abilities, pokemon }
    let _rank = null;            // en -> Team-Auftritte
    let _roster = null;          // [{ name, slug, types, count }]
    let _eff = null;             // (moveType, defTypes) -> Multiplikator
    let _loading = null;

    let _format = 'doubles';
    let _me = null;              // eigenes Pokémon (Anzeigename)
    let _sets = {};              // "name|format|seite" -> bearbeitetes Set
    let _q = '';                 // Suchfeld linke Spalte
    let _oppType = '';           // Typfilter der Matchup-Tabelle
    let _sort = 'rank';
    let _limit = ROSTER_STEP;
    let _calc = null;            // Gegnername, wenn der Rechner offen ist
    let _activated = false;

    function uiLang() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de') ? 'de' : 'en';
    }
    function de() { return uiLang() === 'de'; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function num(n, digits) {
        const s = Number(n || 0).toFixed(digits == null ? 1 : digits);
        return de() ? s.replace('.', ',') : s;
    }

    const LABELS = {
        de: {
            brand: 'Matchups', doubles: 'Doppel', singles: 'Einzel',
            mine: 'Dein Pokémon', search: 'Suchen …', noHit: 'Kein Treffer.',
            set: 'Set', oppSet: 'Gegner-Set', ability: 'Fähigkeit', item: 'Item',
            nature: 'Wesen', noItem: '— kein Item —', moves: 'Attacken',
            empty: '— leer —', points: 'Statuswertpunkte', reset: 'Standard-Set',
            budget: (used) => `${used}/${SP_BUDGET} Punkte`,
            overBudget: 'über dem Budget',
            table: 'Matchups', opponent: 'Gegner', speed: 'Initiative',
            deal: 'Du machst →', take: '← Du nimmst',
            faster: 'schneller', slower: 'langsamer', tie: 'gleich schnell',
            allTypes: 'Alle Typen', sortRank: 'Meta', sortDeal: 'Schaden',
            sortTake: 'Gefahr', sortSpeed: 'Initiative',
            more: (n) => `+${n} weitere anzeigen`,
            noMove: 'keine Angriffsattacke',
            immune: 'immun',
            keinKO: 'kein K.O.',
            flaeche: 'Fläche ×0,75',
            flaecheTitel: 'Flächenattacke im Doppelkampf — trifft mehrere Ziele und '
                        + 'macht deshalb 25 % weniger Schaden je Ziel.',
            zielUnbekannt: 'Ziel unbekannt',
            zielUnbekanntTitel: 'Für diese Attacke liegt kein Zielfeld vor. Im Doppelkampf '
                        + 'ist deshalb offen, ob der 25-%-Abzug für Flächenattacken gilt — '
                        + 'gerechnet wird ohne ihn.',
            loading: 'Lade Matchup-Daten …',
            pickMon: 'Wähle links ein Pokémon.',
            noUsage: 'Für dieses Pokémon liegt in diesem Format kein Set vor.',
            calc: 'Rechner', back: '← zurück zu den Matchups',
            openCalc: 'Im Rechner öffnen',
            youAttack: 'Du greifst an', youDefend: 'Du wirst angegriffen',
            move: 'Attacke', dmg: 'Schaden', share: 'Anteil KP', ko: 'K.O.',
            speedLine: (a, b, verb) => `Initiative ${a} gegen ${b} — du bist ${verb}.`,
            noteHead: 'Gerechnet wird',
            noteIn: 'Level 50, DV 31, Wesen, Statuswertpunkte, Typen-Effektivität, STAB, Leben-Orb und Expertengurt.',
            noteOut: 'Nicht gerechnet: Fähigkeiten, Wetter, Felder, Statusveränderungen, Volltreffer, Mehrfachtreffer.',
            noteSet: 'Das Gegner-Set ist jeweils das meistgenutzte Set dieses Formats — im Rechner änderbar.',
            evs: ['KP', 'ANG', 'VER', 'SPA', 'SPV', 'INI'],
            statNames: ['KP', 'Angriff', 'Verteidigung', 'Sp.-Angriff', 'Sp.-Verteidigung', 'Initiative'],
        },
        en: {
            brand: 'Matchups', doubles: 'Doubles', singles: 'Singles',
            mine: 'Your Pokémon', search: 'Search …', noHit: 'No match.',
            set: 'Set', oppSet: 'Opponent set', ability: 'Ability', item: 'Held item',
            nature: 'Nature', noItem: '— no item —', moves: 'Moves',
            empty: '— empty —', points: 'Stat points', reset: 'Default set',
            budget: (used) => `${used}/${SP_BUDGET} points`,
            overBudget: 'over budget',
            table: 'Matchups', opponent: 'Opponent', speed: 'Speed',
            deal: 'You deal →', take: '← You take',
            faster: 'faster', slower: 'slower', tie: 'a speed tie',
            allTypes: 'All types', sortRank: 'Meta', sortDeal: 'Damage',
            sortTake: 'Danger', sortSpeed: 'Speed',
            more: (n) => `show ${n} more`,
            noMove: 'no damaging move',
            immune: 'immune',
            keinKO: 'no KO',
            flaeche: 'spread ×0.75',
            flaecheTitel: 'Spread move in a double battle — hits more than one target and '
                        + 'therefore deals 25 % less damage to each.',
            zielUnbekannt: 'target unknown',
            zielUnbekanntTitel: 'No target field for this move. In a double battle it is '
                        + 'therefore open whether the 25 % spread reduction applies — '
                        + 'the calculation runs without it.',
            loading: 'Loading matchup data …',
            pickMon: 'Pick a Pokémon on the left.',
            noUsage: 'No set for this Pokémon in this format.',
            calc: 'Calculator', back: '← back to the matchups',
            openCalc: 'Open in calculator',
            youAttack: 'You attack', youDefend: 'You are attacked',
            move: 'Move', dmg: 'Damage', share: 'Share of HP', ko: 'KO',
            speedLine: (a, b, verb) => `Speed ${a} against ${b} — you are ${verb}.`,
            noteHead: 'What is calculated',
            noteIn: 'Level 50, IV 31, nature, stat points, type effectiveness, STAB, Life Orb and Expert Belt.',
            noteOut: 'Not calculated: abilities, weather, terrain, status, critical hits, multi-hit moves.',
            noteSet: 'The opponent set is that format’s most-used set — editable in the calculator.',
            evs: ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'],
            statNames: ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'],
        },
    };
    function L() { return LABELS[uiLang()]; }

    const NATURE_DE = {
        Hardy: 'Robust', Lonely: 'Solo', Brave: 'Mutig', Adamant: 'Hart', Naughty: 'Frech',
        Bold: 'Kühn', Docile: 'Sanft', Relaxed: 'Locker', Impish: 'Pfiffig', Lax: 'Lasch',
        Timid: 'Scheu', Hasty: 'Hastig', Serious: 'Ernst', Jolly: 'Froh', Naive: 'Naiv',
        Modest: 'Mäßig', Mild: 'Mild', Quiet: 'Ruhig', Bashful: 'Zaghaft', Rash: 'Hitzig',
        Calm: 'Still', Gentle: 'Zart', Sassy: 'Forsch', Careful: 'Sacht', Quirky: 'Kauzig',
    };

    const TYPES_EN = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting',
        'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon',
        'Dark', 'Steel', 'Fairy'];

    const TYPE_DE = {
        Normal: 'Normal', Fire: 'Feuer', Water: 'Wasser', Electric: 'Elektro', Grass: 'Pflanze',
        Ice: 'Eis', Fighting: 'Kampf', Poison: 'Gift', Ground: 'Boden', Flying: 'Flug',
        Psychic: 'Psycho', Bug: 'Käfer', Rock: 'Gestein', Ghost: 'Geist', Dragon: 'Drache',
        Dark: 'Unlicht', Steel: 'Stahl', Fairy: 'Fee',
    };

    function tName(t) { return (de() && TYPE_DE[t]) ? TYPE_DE[t] : t; }

    // Englischer Name bleibt führend (die Daten sind englisch), der deutsche
    // steht daneben — genauso wie im Pokédex-Subtab.
    function localName(en, kind) {
        if (!en) return '';
        if (!de()) return en;
        const map = kind === 'nature' ? NATURE_DE : (_namesDe && _namesDe[kind]);
        const d = map && map[en];
        return (d && d !== en) ? d : en;
    }

    // ── Daten ───────────────────────────────────────────────────────

    function jget(url) {
        const base = (typeof BASE_PATH === 'string') ? BASE_PATH : 'data/';
        return fetch(`${base}${url}?t=${Date.now()}`)
            .then(r => r.ok ? r.json() : null).catch(() => null);
    }

    function load() {
        if (_roster) return Promise.resolve(true);
        if (_loading) return _loading;
        _loading = Promise.all([
            jget(USAGE_URL), jget(DEX_URL), jget(TEAMS_URL),
            jget(RES_URL), jget(CHART_URL), jget(NAMES_DE_URL),
        ]).then(([usage, dex, teams, res, chart, names]) => {
            setData({ usage, dex, teams, res, chart, names });
            return true;
        });
        return _loading;
    }

    // Aufbau der Ableitungen — getrennt vom fetch, damit die Tests denselben
    // Weg gehen können wie die Seite.
    function setData(d) {
        _dex = {};
        ((d.dex && d.dex.entries) || []).forEach(e => { _dex[e.en] = e; });
        _usage = (d.usage && d.usage.pokemon) || {};
        _moves = {};
        ((d.res && d.res.entries) || []).forEach(e => {
            if (e.cat === 'move') _moves[e.en] = e;
        });
        _namesDe = d.names || {};
        _eff = (window.ChampionsDamage && window.ChampionsDamage.makeChart)
            ? window.ChampionsDamage.makeChart(d.chart) : (() => 1);
        _rank = countAppearances(d.teams);
        _roster = buildRoster();
        return _roster;
    }

    function countAppearances(teams) {
        const counts = {};
        ((teams && teams.teams) || []).forEach(t => {
            (t.pokemon || []).forEach(p => {
                const n = (p && p.name) ? String(p.name).trim() : '';
                if (n) counts[n] = (counts[n] || 0) + 1;
            });
        });
        return counts;
    }

    // Der Kader sind die Pokémon, für die BEIDES vorliegt: Basiswerte im
    // Pokédex und ein Nutzungsdatensatz. Ohne Basiswerte gibt es keine
    // Werte, ohne Nutzung kein Set — beides zu raten wäre erfunden.
    // 12 Nutzungsdatensätze (Barbaracle, Falinks, Malamar …) haben keinen
    // Pokédex-Eintrag und fallen deshalb heraus statt still zu erscheinen.
    function buildRoster() {
        const out = [];
        Object.keys(_dex).forEach(name => {
            const slug = usageSlug(name);
            if (!slug) return;
            out.push({
                name, slug,
                types: [_dex[name].t1, _dex[name].t2].filter(Boolean),
                count: _rank[name] || 0,
            });
        });
        return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    // Der Pokédex führt meta.slug; wo der fehlt, wird der Name zum Slug.
    // basculegion-male / -female sind zwei Datensätze mit einem Anzeigenamen
    // — der Präfix-Treffer nimmt den, der existiert.
    function usageSlug(name) {
        const e = _dex[name];
        const metaSlug = e && e.meta && e.meta.slug;
        if (metaSlug && _usage[metaSlug]) return metaSlug;
        const base = String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
        if (_usage[base]) return base;
        const hit = Object.keys(_usage).find(k => k === base || k.startsWith(base + '-'));
        return hit || null;
    }

    function usageBlock(name) {
        const slug = usageSlug(name);
        const rec = slug ? _usage[slug] : null;
        return rec ? (rec[_format] || null) : null;
    }

    // ── Sets ────────────────────────────────────────────────────────

    function emptySpread() {
        return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    }

    // Das meistgenutzte Set des Formats: häufigstes Wesen, häufigste
    // Fähigkeit, häufigstes Item, die vier häufigsten Attacken, häufigster
    // Spread. Das ist eine Ableitung aus vier getrennten Verteilungen, kein
    // real gespieltes Set — es steht deshalb als „meistgenutzt" dran und
    // ist im Rechner änderbar.
    function topSet(block) {
        const first = (list) => (list && list[0]) ? list[0].name : '';
        const spread = (block && block.stat_points && block.stat_points[0]
            && block.stat_points[0].points) || null;
        return {
            nature: first(block && block.nature) || 'Hardy',
            ability: first(block && block.ability),
            item: first(block && block.held_item),
            moves: ((block && block.move) || []).slice(0, 4).map(m => m.name),
            spread: Object.assign(emptySpread(), spread || {}),
        };
    }

    // Die Seite gehört mit in den Schlüssel: im Spiegelmatch ist das eigene
    // Pokémon auch der Gegner, und ein gemeinsames Objekt hieße, dass eine
    // Änderung am eigenen Set gleichzeitig das gegnerische ändert.
    function setKey(name, side) { return `${name}|${_format}|${side === 'opp' ? 'opp' : 'me'}`; }

    function setFor(name, side) {
        const key = setKey(name, side);
        if (!_sets[key]) {
            const block = usageBlock(name);
            if (!block) return null;
            _sets[key] = topSet(block);
        }
        return _sets[key];
    }

    // Ein Wert darf nie über 32 und die Summe nie über 66 — was darüber
    // hinausginge, wird auf das Mögliche gekürzt statt woanders abgezogen.
    // Stillschweigend anderswo abzuziehen wäre eine Änderung, die niemand
    // angefordert hat.
    function clampSpread(spread, key, value) {
        const out = Object.assign(emptySpread(), spread);
        const others = SP_KEYS.reduce((s, k) => s + (k === key ? 0 : (Number(out[k]) || 0)), 0);
        const room = Math.max(0, SP_BUDGET - others);
        out[key] = Math.max(0, Math.min(SP_MAX, Math.min(room, Math.round(Number(value) || 0))));
        return out;
    }

    function spreadTotal(spread) {
        return SP_KEYS.reduce((s, k) => s + (Number((spread || {})[k]) || 0), 0);
    }

    function statsOf(name, set) {
        const e = _dex[name];
        if (!e || !set) return null;
        return window.ChampionsDamage.buildStats(e, set.spread, set.nature);
    }

    // ── Schaden ─────────────────────────────────────────────────────

    function moveEntry(name) { return (name && _moves[name]) || null; }

    /**
     * Im Doppelmodus fehlten 25 % Abzug auf jede Flaechenattacke (20.08.2026).
     *
     * Der Umschalter oben rechts steht auf „Doppel" — das ist die Vorgabe
     * dieser Ansicht, `_format` startet auf 'doubles'. Der Aufruf hier
     * uebergab trotzdem fest `spread: false`. Die Zeichenfolge
     * `spread: true` kam im ganzen Projekt nicht vor.
     *
     * ChampionsDamage.damageRange kann den Abzug seit jeher (`opts.spread
     * ? 0.75 : 1`); es fehlte allein die Angabe, WELCHE Attacke eine
     * Flaechenattacke ist. Die Attackendaten fuehrten dafuer kein Feld.
     *
     * Sie tun es jetzt: `target` (PokéAPI move_target_id) und das daraus
     * abgeleitete `spread` stehen in champions_resources.json, 32 der
     * Champions-Schadensattacken sind Flaechenattacken — darunter
     * Erdbeben, Steinhagel, Hitzewelle, Surf und Entladung. Bei einem
     * Erdbeben mit Staerke 100 sind das 25 Schadenspunkte Unterschied
     * pro Wurf, oft der Unterschied zwischen 2HKO und 3HKO.
     *
     * Fehlt das Feld, wird NICHT stillschweigend Einzelziel angenommen —
     * dann bleibt `spread` undefined, und die Zeile weist das aus.
     */
    function istFlaeche(mv) {
        return (mv && typeof mv.spread === 'boolean') ? mv.spread : null;
    }

    function rangeFor(attName, attSet, attStats, defName, defSet, defStats, moveName) {
        const mv = moveEntry(moveName);
        if (!mv) return null;
        const a = _dex[attName], d = _dex[defName];
        if (!a || !d) return null;
        const flaeche = istFlaeche(mv);
        const r = window.ChampionsDamage.damageRange({
            move: mv,
            attackerStats: attStats,
            defenderStats: defStats,
            attackerTypes: [a.t1, a.t2].filter(Boolean),
            effectiveness: _eff(mv.type, [d.t1, d.t2].filter(Boolean)),
            item: attSet.item,
            spread: _format === 'doubles' && flaeche === true,
        });
        if (r) {
            r.spreadAngewendet = _format === 'doubles' && flaeche === true;
            r.zielUnbekannt = _format === 'doubles' && flaeche === null;
        }
        return r;
    }

    // Alle Attacken eines Sets gegen ein Ziel, stärkste zuerst. Attacken
    // ohne Stärke (Status) und unbekannte Namen fallen raus, statt als 0
    // Schaden zu erscheinen — 0 hieße „trifft für nichts", nicht „greift
    // nicht an".
    function moveTable(attName, attSet, defName, defSet) {
        const attStats = statsOf(attName, attSet);
        const defStats = statsOf(defName, defSet);
        if (!attStats || !defStats) return [];
        const rows = [];
        (attSet.moves || []).forEach(mn => {
            const range = rangeFor(attName, attSet, attStats, defName, defSet, defStats, mn);
            if (range) rows.push({ name: mn, move: moveEntry(mn), range });
        });
        return rows.sort((x, y) => y.range.max - x.range.max || y.range.min - x.range.min);
    }

    function bestMove(attName, attSet, defName, defSet) {
        return moveTable(attName, attSet, defName, defSet)[0] || null;
    }

    function matchup(oppName) {
        const meSet = setFor(_me, 'me'), oppSet = setFor(oppName, 'opp');
        if (!meSet || !oppSet) return null;
        const meStats = statsOf(_me, meSet), oppStats = statsOf(oppName, oppSet);
        if (!meStats || !oppStats) return null;
        return {
            name: oppName,
            meStats, oppStats, meSet, oppSet,
            deal: bestMove(_me, meSet, oppName, oppSet),
            take: bestMove(oppName, oppSet, _me, meSet),
            spd: window.ChampionsDamage.speedComparison(meStats.spe, oppStats.spe),
        };
    }

    // „OHKO" heißt: auch der niedrigste Wurf tötet. Wenn nur ein Teil der
    // Würfe reicht, steht der Anteil dabei — alles andere überzeichnet.
    //
    // „5+" ist weg. Es entstand daraus, dass koChance() nur bis vier
    // Treffer rechnete und danach pauschal `{hits: 5, chance: 0}`
    // zurückgab — die Beschriftung schrieb also „5+HKO 0 %", auch wo ein
    // fünfter Treffer sicher tötet. Die Rechnung geht jetzt bis neun und
    // nennt die Trefferzahl, die sie gefunden hat.
    //
    // Erst wenn auch neun Treffer nicht reichen, gibt es keine Zahl mehr —
    // dann steht da, dass es keinen K.O. gibt, statt eines „0 %", das wie
    // eine gerechnete Wahrscheinlichkeit aussieht.
    function koLabel(ko) {
        if (!ko) return '';
        if (ko.hits == null) return L().keinKO;
        const base = ko.hits === 1 ? 'OHKO' : `${ko.hits}HKO`;
        if (ko.chance >= 1) return base;
        return `${base} ${Math.round(ko.chance * 100)} %`;
    }

    function effLabel(v) {
        if (v === 0) return L().immune;
        if (v === 1) return '';
        const s = (v === 0.25) ? '¼×' : (v === 0.5) ? '½×' : `${num(v, v % 1 ? 1 : 0)}×`;
        return s;
    }

    function effClass(v) {
        if (v === 0) return ' is-immune';
        if (v > 1) return ' is-super';
        if (v < 1) return ' is-resist';
        return '';
    }

    // ── Bausteine ───────────────────────────────────────────────────

    function sectionLabel(text, note) {
        return `<h4 class="sq-lbl">${esc(text)}${note ? `<em>${esc(note)}</em>` : ''}</h4>`;
    }

    function sprite(name, cls) {
        return (window.championsSprite && typeof window.championsSprite.img === 'function')
            ? window.championsSprite.img(name, cls || 'sq-mu-img') : '';
    }

    // Reuses the canonical type palette of the play view (.sq-play-type-*)
    // rather than defining a second one — two palettes drift.
    function typeChips(types) {
        return (types || []).map(t =>
            `<span class="sq-mu-type sq-play-type-${esc(String(t).toLowerCase())}">${
                esc(tName(t))}</span>`).join('');
    }

    function nameHtml(en, kind) {
        const d = localName(en, kind);
        return (d && d !== en)
            ? `${esc(en)}<small>${esc(d)}</small>`
            : esc(en);
    }

    // ── Set-Editor (die eine Komponente) ────────────────────────────
    //
    // side ist 'me' oder 'opp'; beide Seiten benutzen exakt dieselbe
    // Funktion, damit ein Gegner-Set nicht anders gebaut wird als das
    // eigene. Die Vorbelegung ist immer das meistgenutzte Set.

    function optionList(values, selected, kind, placeholder) {
        const opts = [];
        if (placeholder != null) {
            opts.push(`<option value=""${selected ? '' : ' selected'}>${esc(placeholder)}</option>`);
        }
        values.forEach(v => {
            const label = v.pct != null
                ? `${localName(v.name, kind)} · ${num(v.pct)} %`
                : localName(v.name, kind);
            opts.push(`<option value="${esc(v.name)}"${v.name === selected ? ' selected' : ''}>${
                esc(label)}</option>`);
        });
        return opts.join('');
    }

    // Attacken-Auswahl: erst die meistgenutzten dieses Pokémon mit Anteil,
    // darunter der gesamte Attackenpool. Wer ein Set nachbauen will, findet
    // oben was er sucht; wer etwas Ungewöhnliches testet, unten.
    function moveSelect(side, i, current, block) {
        const used = ((block && block.move) || []).map(m => m.name);
        const rest = Object.keys(_moves)
            .filter(n => used.indexOf(n) === -1)
            .sort((a, b) => localName(a, 'moves').localeCompare(localName(b, 'moves')));
        const opt = (n, pct) => `<option value="${esc(n)}"${n === current ? ' selected' : ''}>${
            esc(localName(n, 'moves') + (pct != null ? ` · ${num(pct)} %` : ''))}</option>`;
        const usedOpts = ((block && block.move) || []).map(m => opt(m.name, m.pct)).join('');
        const restOpts = rest.map(n => opt(n)).join('');
        return `<select class="sq-in" data-sq-side="${side}" data-sq-field="move" data-sq-i="${i}"
                        aria-label="${esc(L().moves)} ${i + 1}">
                <option value=""${current ? '' : ' selected'}>${esc(L().empty)}</option>
                <optgroup label="${esc(de() ? 'Meistgenutzt' : 'Most used')}">${usedOpts}</optgroup>
                <optgroup label="${esc(de() ? 'Alle Attacken' : 'All moves')}">${restOpts}</optgroup>
            </select>`;
    }

    function spRow(side, key, i, spread) {
        const v = Number(spread[key]) || 0;
        return `<div class="sq-sp-row">
                <span class="sq-sp-lbl">${esc(L().evs[i])}</span>
                <input class="sq-sp-range" type="range" min="0" max="${SP_MAX}" step="1"
                       value="${v}" data-sq-side="${side}" data-sq-field="sp" data-sq-key="${key}"
                       aria-label="${esc(L().statNames[i])}">
                <span class="sq-sp-val" data-sq-spval="${side}-${key}">${v}</span>
            </div>`;
    }

    function statsRow(stats) {
        if (!stats) return '';
        return `<div class="sq-mu-stats">${SP_KEYS.map((k, i) =>
            `<span class="sq-mu-stat"><b>${stats[k]}</b><span>${esc(L().evs[i])}</span></span>`).join('')}</div>`;
    }

    function setEditor(side, name, set, title) {
        const block = usageBlock(name);
        const e = _dex[name];
        if (!e || !set) {
            return `<div class="sq-panel">${sectionLabel(title)}
                    <p class="sq-empty">${esc(L().noUsage)}</p></div>`;
        }
        const natures = Object.keys(window.ChampionsDamage.NATURES)
            .sort((a, b) => localName(a, 'nature').localeCompare(localName(b, 'nature')))
            .map(n => ({ name: n }));
        const total = spreadTotal(set.spread);
        const over = total > SP_BUDGET;
        return `<div class="sq-panel sq-set" data-sq-editor="${side}">
                ${sectionLabel(title, localName(name, 'pokemon'))}
                <div class="sq-set-head">
                    ${sprite(name, 'sq-set-img')}
                    <span class="sq-set-nm">${esc(name)}</span>
                    <span class="sq-set-types">${typeChips([e.t1, e.t2].filter(Boolean))}</span>
                </div>
                <label class="sq-fld"><span>${esc(L().ability)}</span>
                    <select class="sq-in" data-sq-side="${side}" data-sq-field="ability">
                        ${optionList((block && block.ability) || [], set.ability, 'abilities', '—')}
                    </select></label>
                <label class="sq-fld"><span>${esc(L().item)}</span>
                    <select class="sq-in" data-sq-side="${side}" data-sq-field="item">
                        ${optionList((block && block.held_item) || [], set.item, 'items', L().noItem)}
                    </select></label>
                <label class="sq-fld"><span>${esc(L().nature)}</span>
                    <select class="sq-in" data-sq-side="${side}" data-sq-field="nature">
                        ${optionList(natures, set.nature, 'nature')}
                    </select></label>
                <div class="sq-fld"><span>${esc(L().moves)}</span></div>
                <div class="sq-set-moves">
                    ${[0, 1, 2, 3].map(i => moveSelect(side, i, set.moves[i] || '', block)).join('')}
                </div>
                <div class="sq-sp">
                    <div class="sq-sp-head">
                        <span>${esc(L().points)}</span>
                        <span class="sq-sp-tot${over ? ' is-over' : ''}" data-sq-sptot="${side}">${
                            esc(L().budget(total))}${over ? ` · ${esc(L().overBudget)}` : ''}</span>
                    </div>
                    ${SP_KEYS.map((k, i) => spRow(side, k, i, set.spread)).join('')}
                </div>
                <button type="button" class="sq-btn" data-sq-reset="${side}">${esc(L().reset)}</button>
                ${statsRow(statsOf(name, set))}
            </div>`;
    }

    // ── Matchup-Liste ───────────────────────────────────────────────

    function rosterHtml() {
        const q = _q.trim().toLowerCase();
        const rows = _roster.filter(r => !q
            || r.name.toLowerCase().indexOf(q) !== -1
            || localName(r.name, 'pokemon').toLowerCase().indexOf(q) !== -1);
        const body = rows.length ? rows.slice(0, 200).map(r => `
            <div class="sq-row${_me === r.name ? ' sel' : ''}" data-sq-mine="${esc(r.name)}"
                 role="button" tabindex="0">
                <span class="nm">${esc(r.name)}${r.count
                    ? `<span class="sub"> ${r.count}</span>` : ''}</span>
            </div>`).join('')
            : `<p class="sq-empty">${esc(L().noHit)}</p>`;
        return `<div class="sq-panel">
                ${sectionLabel(L().mine, `${rows.length}`)}
                <input class="sq-in sq-search" type="search" value="${esc(_q)}"
                       placeholder="${esc(L().search)}" data-sq-q aria-label="${esc(L().search)}">
                <div class="sq-list sq-mu-list">${body}</div>
            </div>`;
    }

    // data-lbl trägt die Spaltenüberschrift in die Zelle. Auf dem Handy
    // fällt der Tabellenkopf weg, und ohne Beschriftung wäre nicht mehr zu
    // sehen, welche der beiden Zahlen der eigene Schaden ist.
    function sideCell(best, cls, label) {
        const head = ` data-lbl="${esc(label)}"`;
        if (!best) return `<span class="sq-mu-cell"${head}><span class="sq-mu-none">${esc(L().noMove)}</span></span>`;
        const r = best.range;
        if (r.immune) {
            return `<span class="sq-mu-cell"${head}>
                    <span class="sq-mu-mv">${esc(localName(best.name, 'moves'))}</span>
                    <span class="sq-mu-ko is-immune">${esc(L().immune)}</span></span>`;
        }
        const w = Math.max(2, Math.min(100, r.maxPct));
        const eff = effLabel(r.effectiveness);
        return `<span class="sq-mu-cell"${head}>
                <span class="sq-mu-mv">${esc(localName(best.name, 'moves'))}${
                    eff ? `<i class="sq-mu-eff${effClass(r.effectiveness)}">${esc(eff)}</i>` : ''}</span>
                <span class="sq-mu-bar ${cls}"><i style="width:${w}%"></i></span>
                <span class="sq-mu-pct">${esc(num(r.minPct))}–${esc(num(r.maxPct))} %</span>
                <span class="sq-mu-ko">${esc(koLabel(r.ko))}</span>
            </span>`;
    }

    function speedCell(spd) {
        const cls = spd.tie ? 'is-tie' : (spd.faster ? 'is-fast' : 'is-slow');
        const word = spd.tie ? L().tie : (spd.faster ? L().faster : L().slower);
        return `<span class="sq-mu-spd ${cls}">
                <span class="sq-mu-spd-n"><b>${spd.mine}</b><i>${spd.theirs}</i></span>
                <span>${esc(word)}</span></span>`;
    }

    function sortedOpponents() {
        const list = _roster.filter(r =>
            (!_oppType || r.types.indexOf(_oppType) !== -1) && usageBlock(r.name));
        const rows = list.map(r => matchup(r.name)).filter(Boolean)
            .map(m => Object.assign(m, { count: _rank[m.name] || 0 }));
        const maxPct = (b) => (b && b.range && !b.range.immune) ? b.range.maxPct : -1;
        if (_sort === 'deal') rows.sort((a, b) => maxPct(b.deal) - maxPct(a.deal));
        else if (_sort === 'take') rows.sort((a, b) => maxPct(b.take) - maxPct(a.take));
        else if (_sort === 'speed') rows.sort((a, b) => a.oppStats.spe - b.oppStats.spe);
        else rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return rows;
    }

    function tableHtml() {
        if (!_me) return `<div class="sq-panel"><p class="sq-empty">${esc(L().pickMon)}</p></div>`;
        if (!setFor(_me, 'me')) {
            return `<div class="sq-panel">${sectionLabel(_me)}
                    <p class="sq-empty">${esc(L().noUsage)}</p></div>`;
        }
        const all = sortedOpponents();
        const rows = all.slice(0, _limit);
        const sortBtn = (val, label) =>
            `<button type="button" data-sq-sort="${val}" class="${_sort === val ? 'on' : ''}">${esc(label)}</button>`;
        const typeOpts = [`<option value="">${esc(L().allTypes)}</option>`].concat(
            TYPES_EN.map(t => `<option value="${esc(t)}"${_oppType === t ? ' selected' : ''}>${
                esc(tName(t))}</option>`)).join('');
        const body = rows.map(m => `
            <div class="sq-mu-row" data-sq-opp="${esc(m.name)}" role="button" tabindex="0"
                 title="${esc(L().openCalc)}">
                <span class="sq-mu-mon">${sprite(m.name)}<span class="sq-mu-nm">${
                    nameHtml(m.name, 'pokemon')}</span></span>
                ${speedCell(m.spd)}
                ${sideCell(m.deal, 'is-deal', L().deal)}
                ${sideCell(m.take, 'is-take', L().take)}
            </div>`).join('');
        const more = all.length > rows.length
            ? `<button type="button" class="sq-btn sq-more" data-sq-more>${
                esc(L().more(all.length - rows.length))}</button>`
            : '';
        return `<div class="sq-panel sq-mu">
                <div class="sq-mu-bar-top">
                    ${sectionLabel(L().table, `${all.length}`)}
                    <span class="sq-spacer"></span>
                    <select class="sq-in sq-mu-type-sel" data-sq-opptype
                            aria-label="${esc(L().allTypes)}">${typeOpts}</select>
                    <span class="sq-seg sq-mu-sort">
                        ${sortBtn('rank', L().sortRank)}${sortBtn('deal', L().sortDeal)}
                        ${sortBtn('take', L().sortTake)}${sortBtn('speed', L().sortSpeed)}
                    </span>
                </div>
                <div class="sq-mu-head">
                    <span>${esc(L().opponent)}</span><span>${esc(L().speed)}</span>
                    <span>${esc(L().deal)}</span><span>${esc(L().take)}</span>
                </div>
                <div class="sq-mu-rows">${body}</div>
                ${more}
                ${noteHtml()}
            </div>`;
    }

    function noteHtml() {
        return `<p class="sq-note"><b>${esc(L().noteHead)}:</b> ${esc(L().noteIn)}
                ${esc(L().noteOut)} ${esc(L().noteSet)}</p>`;
    }

    // ── Rechner ─────────────────────────────────────────────────────

    // `tone` färbt den Balken wie in der Matchup-Tabelle: grün, was du
    // austeilst, rot, was du einsteckst. Zwei grüne Tabellen untereinander
    // lassen die Richtung verschwinden.
    function dmgTable(title, attName, attSet, defName, defSet, tone) {
        const rows = moveTable(attName, attSet, defName, defSet);
        const defStats = statsOf(defName, defSet);
        if (!rows.length) {
            return `<div class="sq-panel">${sectionLabel(title)}
                    <p class="sq-empty">${esc(L().noMove)}</p></div>`;
        }
        const body = rows.map(r => {
            const g = r.range;
            const eff = effLabel(g.effectiveness);
            const w = Math.max(2, Math.min(100, g.maxPct));
            // Der 25-%-Abzug fuer Flaechenattacken muss dastehen, wo er
            // greift — sonst sieht ein Erdbeben mit 75 statt 100 Schaden
            // nach einem Rechenfehler aus. Und wo das Zielfeld fehlt,
            // steht das ebenfalls da, statt Einzelziel zu unterstellen.
            const flaecheHtml = g.spreadAngewendet
                ? ` · <span class="sq-calc-flaeche" title="${esc(L().flaecheTitel)}">${
                      esc(L().flaeche)}</span>`
                : (g.zielUnbekannt
                    ? ` · <span class="sq-calc-unklar" title="${esc(L().zielUnbekanntTitel)}">${
                          esc(L().zielUnbekannt)}</span>`
                    : '');
            return `<div class="sq-calc-row">
                    <span class="sq-calc-mv">${nameHtml(r.name, 'moves')}
                        <i class="sq-calc-meta">${esc(tName(r.move.type))} · ${
                            esc(r.move.power)}${g.stab > 1 ? ' · STAB' : ''}${
                            eff ? ` · <span class="sq-mu-eff${effClass(g.effectiveness)}">${eff}</span>` : ''}${
                            flaecheHtml}</i>
                    </span>
                    <span class="sq-calc-num">${g.min}–${g.max}</span>
                    <span class="sq-mu-bar ${tone || 'is-deal'}"><i style="width:${w}%"></i></span>
                    <span class="sq-calc-pct">${esc(num(g.minPct))}–${esc(num(g.maxPct))} %</span>
                    <span class="sq-mu-ko">${esc(koLabel(g.ko))}</span>
                </div>`;
        }).join('');
        return `<div class="sq-panel">
                ${sectionLabel(title, defStats ? `${defStats.hp} ${L().evs[0]}` : '')}
                <div class="sq-calc-head">
                    <span>${esc(L().move)}</span><span>${esc(L().dmg)}</span>
                    <span></span><span>${esc(L().share)}</span><span>${esc(L().ko)}</span>
                </div>
                ${body}
            </div>`;
    }

    function calcHtml() {
        const meSet = setFor(_me, 'me'), oppSet = setFor(_calc, 'opp');
        if (!meSet || !oppSet) return `<div class="sq-panel"><p class="sq-empty">${esc(L().noUsage)}</p></div>`;
        const meStats = statsOf(_me, meSet), oppStats = statsOf(_calc, oppSet);
        const spd = window.ChampionsDamage.speedComparison(meStats.spe, oppStats.spe);
        const verb = spd.tie ? L().tie : (spd.faster ? L().faster : L().slower);
        return `<div class="sq-grid sq-grid-calc">
                <div>${setEditor('me', _me, meSet, L().set)}</div>
                <div>${setEditor('opp', _calc, oppSet, L().oppSet)}</div>
                <div class="sq-stack">
                    <div class="sq-panel sq-speed ${spd.tie ? 'is-tie' : (spd.faster ? 'is-fast' : 'is-slow')}">
                        ${esc(L().speedLine(spd.mine, spd.theirs, verb))}
                    </div>
                    ${dmgTable(L().youAttack, _me, meSet, _calc, oppSet, 'is-deal')}
                    ${dmgTable(L().youDefend, _calc, oppSet, _me, meSet, 'is-take')}
                    ${noteHtml()}
                </div>
            </div>`;
    }

    // ── Rendern ─────────────────────────────────────────────────────

    function render() {
        const host = document.getElementById('sideQuestMatchupsHost');
        if (!host) return;
        if (!_roster) {
            host.innerHTML = `<div class="sq-console"><div class="sq-grid"><div class="sq-panel">${
                esc(L().loading)}</div></div></div>`;
            return;
        }
        const seg = (val, label) =>
            `<button type="button" data-sq-format="${val}" class="${_format === val ? 'on' : ''}">${esc(label)}</button>`;
        const back = _calc
            ? `<button type="button" class="sq-btn sq-back" data-sq-back>${esc(L().back)}</button>`
            : '';
        host.innerHTML = `
            <div class="sq-console">
                <div class="sq-top">
                    <span class="sq-brand">Champions <span>${esc(_calc ? L().calc : L().brand)}</span></span>
                    ${back}
                    <span class="sq-spacer"></span>
                    <span class="sq-seg">${seg('doubles', L().doubles)}${seg('singles', L().singles)}</span>
                </div>
                ${_calc ? calcHtml() : `<div class="sq-grid">
                    <div class="sq-col-pick">${rosterHtml()}</div>
                    <div class="sq-col-set">${_me && setFor(_me, 'me')
                        ? setEditor('me', _me, setFor(_me, 'me'), L().set)
                        : `<div class="sq-panel"><p class="sq-empty">${esc(L().pickMon)}</p></div>`}</div>
                    <div class="sq-col-table">${tableHtml()}</div>
                </div>`}
            </div>`;
        wire(host);
    }

    function editorTarget(side) {
        const name = side === 'opp' ? _calc : _me;
        return { name, set: name ? setFor(name, side) : null };
    }

    function wire(host) {
        host.querySelectorAll('[data-sq-format]').forEach(b => {
            b.addEventListener('click', () => {
                _format = b.getAttribute('data-sq-format');
                _limit = ROSTER_STEP;
                render();
            });
        });
        host.querySelectorAll('[data-sq-mine]').forEach(r => {
            const pick = () => {
                _me = r.getAttribute('data-sq-mine');
                _limit = ROSTER_STEP;
                render();
            };
            r.addEventListener('click', pick);
            r.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
            });
        });
        host.querySelectorAll('[data-sq-opp]').forEach(r => {
            const open = () => { _calc = r.getAttribute('data-sq-opp'); render(); };
            r.addEventListener('click', open);
            r.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
            });
        });
        const backBtn = host.querySelector('[data-sq-back]');
        if (backBtn) backBtn.addEventListener('click', () => { _calc = null; render(); });

        const more = host.querySelector('[data-sq-more]');
        if (more) more.addEventListener('click', () => { _limit += ROSTER_STEP; render(); });

        const typeSel = host.querySelector('[data-sq-opptype]');
        if (typeSel) typeSel.addEventListener('change', () => {
            _oppType = typeSel.value; _limit = ROSTER_STEP; render();
        });

        host.querySelectorAll('[data-sq-sort]').forEach(b => {
            b.addEventListener('click', () => {
                _sort = b.getAttribute('data-sq-sort'); _limit = ROSTER_STEP; render();
            });
        });

        // Die Suche darf nicht neu rendern — sonst verliert das Feld nach
        // dem ersten Buchstaben den Fokus. Nur die Liste wird ersetzt.
        const q = host.querySelector('[data-sq-q]');
        if (q) {
            q.addEventListener('input', () => {
                _q = q.value;
                const panel = q.closest('.sq-panel');
                const list = panel && panel.querySelector('.sq-mu-list');
                if (!list) return;
                const tmp = document.createElement('div');
                tmp.innerHTML = rosterHtml();
                const fresh = tmp.querySelector('.sq-mu-list');
                if (fresh) { list.innerHTML = fresh.innerHTML; wire(panel); }
            });
        }

        host.querySelectorAll('[data-sq-field]').forEach(el => {
            const side = el.getAttribute('data-sq-side');
            const field = el.getAttribute('data-sq-field');
            if (field === 'sp') {
                // Beim Ziehen nur die Zahl mitführen, erst beim Loslassen
                // neu rechnen — sonst ruckelt der Regler.
                el.addEventListener('input', () => {
                    const out = host.querySelector(`[data-sq-spval="${side}-${el.getAttribute('data-sq-key')}"]`);
                    if (out) out.textContent = el.value;
                });
                el.addEventListener('change', () => {
                    const t = editorTarget(side);
                    if (!t.set) return;
                    t.set.spread = clampSpread(t.set.spread, el.getAttribute('data-sq-key'), el.value);
                    render();
                });
                return;
            }
            el.addEventListener('change', () => {
                const t = editorTarget(side);
                if (!t.set) return;
                if (field === 'move') t.set.moves[Number(el.getAttribute('data-sq-i'))] = el.value;
                else t.set[field] = el.value;
                render();
            });
        });

        host.querySelectorAll('[data-sq-reset]').forEach(b => {
            b.addEventListener('click', () => {
                const side = b.getAttribute('data-sq-reset');
                const name = side === 'opp' ? _calc : _me;
                if (!name) return;
                delete _sets[setKey(name, side)];
                render();
            });
        });
    }

    function activate() {
        if (_activated) { render(); return; }
        _activated = true;
        render();
        load().then(() => {
            if (!_me && _roster.length) _me = _roster[0].name;
            render();
        });
    }

    document.addEventListener('languageChanged', () => {
        const host = document.getElementById('sideQuestMatchupsHost');
        if (host && !host.hidden && _activated) render();
    });

    window.sideQuestMatchups = { activate };
    window._sqMatchupInternals = {
        setData, topSet, clampSpread, spreadTotal, buildRoster, usageSlug,
        moveTable, bestMove, koLabel, effLabel, statsOf, matchup,
        SP_MAX, SP_BUDGET,
        state: (patch) => { if (patch && patch.format) _format = patch.format;
                            if (patch && patch.me) _me = patch.me; },
    };
})();
