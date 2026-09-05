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

    /* ── Team-Rechner (02.09.2026) ──────────────────────────────────
       Der Rechner darueber ist einer gegen einen. Im Doppelkampf steht
       aber nie ein Paar auf dem Feld, sondern ein Team gegen ein Team,
       und die Frage ist nicht "was macht A gegen B", sondern "wen von
       den vieren kann ich ueberhaupt umlegen, und wer legt mich um".
       Genau das war der Auftrag: eigenes Team, sechs des Gegners, davon
       die vier mitgebrachten aktiv schalten.

       Die Zahlen kommen aus demselben moveTable()/bestMove() wie die
       Einzelansicht. Ein zweiter Rechenweg waere der sichere Weg zu
       zwei verschiedenen Antworten auf dieselbe Frage — der Kopf dieser
       Datei sagt das ueber sich selbst, und es gilt hier genauso. */
    let _teamAn = false;         // steht die Team-Ansicht?
    let _teamMine = [];          // [{ name, set }] — aus dem Builder oder leer
    let _teamOpp = [];           // [name] — bis zu sechs
    let _teamAusMine = null;     // Set von Namen, die NICHT im Kampf sind
    let _teamAusOpp = null;
    let _teamQ = '';             // Suchfeld fuer die Gegnerbank

    const TEAM_MAX = 6;
    // Vier ist die Zahl, die man in einen Doppelkampf schickt. Sie ist
    // hier eine ANZEIGE, keine Sperre: wer sechs durchrechnen will, um
    // erst danach zu waehlen, soll das duerfen. Gesperrt wuerde das
    // Werkzeug genau dort unbrauchbar, wo man es am meisten braucht.
    const TEAM_KAMPF = 4;

    function ausSet(seite) {
        if (seite === 'opp') { if (!_teamAusOpp) _teamAusOpp = new Set(); return _teamAusOpp; }
        if (!_teamAusMine) _teamAusMine = new Set();
        return _teamAusMine;
    }
    function istAktiv(seite, name) { return !ausSet(seite).has(name); }
    function aktiveNamen(seite) {
        const liste = seite === 'opp' ? _teamOpp : _teamMine.map(m => m.name);
        return liste.filter(n => istAktiv(seite, n));
    }

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
            showingOf: (shown, total) => `zeige ${shown} von ${total} — per Suche verfeinern`,
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
            teamCalc: 'Team-Rechner',
            teamBack: '\u2190 zur\u00fcck zu den Matchups',
            teamMine: 'Dein Team', teamOpp: 'Gegner',
            teamHint: 'Klick ein Pok\u00e9mon an, um es aus dem Kampf zu nehmen. '
                    + 'Im Doppelkampf bringt man sechs mit und schickt vier \u2014 '
                    + 'gerechnet wird nur mit den aktiven.',
            teamPickOpp: 'Gegner-Pok\u00e9mon hinzuf\u00fcgen \u2026',
            teamOppEmpty: 'Noch kein Gegner gew\u00e4hlt. Such oben ein Pok\u00e9mon.',
            teamMineEmpty: 'Kein Team \u00fcbergeben. Bau eins im Team-Builder und '
                    + 'klick dort auf \u201eIm Rechner \u00f6ffnen\u201c.',
            teamNoneAktiv: 'Auf einer Seite ist niemand aktiv \u2014 schalte mindestens '
                    + 'je ein Pok\u00e9mon wieder an.',
            teamAktivVon: (a, n) => `${a} von ${n} aktiv`,
            teamZuVieleAktiv: 'mehr als vier aktiv',
            teamZuVieleTitel: 'Im Doppelkampf schickt man vier. Gerechnet wird trotzdem '
                    + 'mit allen aktiven \u2014 die Zeile sagt nur, dass es mehr sind, '
                    + 'als in einen Kampf passen.',
            teamDeal: 'du teilst aus', teamTake: 'du steckst ein',
            teamRemove: 'aus dem Kampf nehmen', teamAdd: 'in den Kampf nehmen',
            teamEntfernen: 'vom Brett nehmen',
            teamKeinSet: 'kein Set',
            teamKeineAttacke: 'keine Angriffsattacke',
            teamSchnell: 'schneller', teamLangsam: 'langsamer', teamGleich: 'gleich schnell',
            teamZelleTitel: (me, opp) => `${me} gegen ${opp}`,
            teamOffen: 'Team-Rechner \u00f6ffnen',
            teamUrteilGut: 'du legst zuerst um',
            teamUrteilSchlecht: 'er legt zuerst um',
            teamUrteilPatt: 'unentschieden',
            teamZelleLeerTitel: 'Zu einem der beiden Pok\u00e9mon liegt in diesem Format kein Set vor \u2014 siehe die Warnung am Chip.',
            teamZuEinzeln: 'einzeln aufmachen',
            noteTeam: 'Jede Zelle zeigt die st\u00e4rkste Attacke beider Seiten. Klick sie an, um das Paar einzeln mit allen Attacken und dem Set-Editor zu \u00f6ffnen.',
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
            showingOf: (shown, total) => `showing ${shown} of ${total} — refine via search`,
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
            teamCalc: 'Team calculator',
            teamBack: '\u2190 back to the matchups',
            teamMine: 'Your team', teamOpp: 'Opponent',
            teamHint: 'Click a Pok\u00e9mon to take it out of the battle. In a double '
                    + 'battle you bring six and send four \u2014 only the active ones '
                    + 'are calculated.',
            teamPickOpp: 'Add an opposing Pok\u00e9mon \u2026',
            teamOppEmpty: 'No opponent picked yet. Search for a Pok\u00e9mon above.',
            teamMineEmpty: 'No team handed over. Build one in the team builder and '
                    + 'click \u201cOpen in calculator\u201d there.',
            teamNoneAktiv: 'One side has nobody active \u2014 switch at least one '
                    + 'Pok\u00e9mon back on.',
            teamAktivVon: (a, n) => `${a} of ${n} active`,
            teamZuVieleAktiv: 'more than four active',
            teamZuVieleTitel: 'A double battle sends four. The calculation still uses '
                    + 'every active Pok\u00e9mon \u2014 the line only says there are '
                    + 'more than fit into one battle.',
            teamDeal: 'you deal', teamTake: 'you take',
            teamRemove: 'take out of the battle', teamAdd: 'put into the battle',
            teamEntfernen: 'remove from the board',
            teamKeinSet: 'no set',
            teamKeineAttacke: 'no damaging move',
            teamSchnell: 'faster', teamLangsam: 'slower', teamGleich: 'same speed',
            teamZelleTitel: (me, opp) => `${me} against ${opp}`,
            teamOffen: 'Open team calculator',
            teamUrteilGut: 'you knock out first',
            teamUrteilSchlecht: 'they knock out first',
            teamUrteilPatt: 'a draw',
            teamZelleLeerTitel: 'One of the two has no set in this format \u2014 see the warning on its chip.',
            teamZuEinzeln: 'open one on one',
            noteTeam: 'Each cell shows the strongest move on both sides. Click it to open that pair on its own, with every move and the set editor.',
        },
    };
    function L() { return LABELS[uiLang()]; }

    // Die 25 Wesen stehen seit dem 03.09.2026 EINMAL, in
    // js/champions-namen.js. Vorher fuehrten drei Module ihre eigene
    // Kopie — und die des Team-Builders fehlte ganz, weshalb dort
    // "Modest" statt "Maessig" stand. Fail-soft: ohne das Modul bleibt
    // der englische Name stehen.
    const NATURE_DE = (window.ChampionsNamen && window.ChampionsNamen.WESEN_DE) || {};

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
        const RENDER_LIMIT = 200;
        const body = rows.length ? rows.slice(0, RENDER_LIMIT).map(r => `
            <div class="sq-row${_me === r.name ? ' sel' : ''}" data-sq-mine="${esc(r.name)}"
                 role="button" tabindex="0">
                <span class="nm">${esc(r.name)}${r.count
                    ? `<span class="sub"> ${r.count}</span>` : ''}</span>
            </div>`).join('')
            : `<p class="sq-empty">${esc(L().noHit)}</p>`;
        // Gerendert werden nur RENDER_LIMIT Zeilen; bei mehr muss das Label die
        // verborgene Menge signalisieren, statt die volle Zeilenzahl zu nennen
        // (frueher log das Label "287", angezeigt waren 200 — Audit 2, F19).
        const note = rows.length > RENDER_LIMIT
            ? L().showingOf(RENDER_LIMIT, rows.length)
            : `${rows.length}`;
        return `<div class="sq-panel">
                ${sectionLabel(L().mine, note)}
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

    /* `imTeam` laesst den Satz ueber das aenderbare Gegner-Set weg: in der
       Team-Ansicht gibt es keinen Set-Editor, und eine Fussnote, die auf
       einen Knopf zeigt, den es dort nicht gibt, schickt den Leser
       suchen. Stattdessen steht dort, wie man an die volle
       Attackentabelle kommt. */
    function noteHtml(imTeam) {
        const letzter = imTeam ? L().noteTeam : L().noteSet;
        return `<p class="sq-note"><b>${esc(L().noteHead)}:</b> ${esc(L().noteIn)}
                ${esc(L().noteOut)} ${esc(letzter)}</p>`;
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

    // ── Team-Rechner ────────────────────────────────────────────────

    /* Ein uebergebenes Set gewinnt gegen das meistgenutzte.

       Wer im Builder eine Verteilung baut und dann rechnet, will SEINE
       Zahlen sehen, nicht die des Durchschnittsspielers. Fehlt zu einem
       Namen ein uebergebenes Set (oder wurde die Seite ohne Uebergabe
       geoeffnet), faellt es auf setFor() zurueck — dieselbe Quelle wie
       die Einzelansicht. */
    function teamSet(seite, name) {
        if (seite === 'me') {
            const eigen = _teamMine.find(m => m.name === name);
            if (eigen && eigen.set) return eigen.set;
        }
        return setFor(name, seite);
    }

    /* Eine Zelle der Matrix: was ICH gegen dieses Gegner-Pokemon anrichte
       und was es gegen mich anrichtet, jeweils mit der staerksten Attacke.

       Beide Richtungen in EINER Zelle, weil die Frage im Doppelkampf
       immer beide zugleich ist — "ich lege es um" ist wertlos, wenn es
       vorher zieht und mich umlegt. Deshalb steht die Initiative auch
       nicht in einer eigenen Spalte, sondern als Zeichen in der Zelle. */
    function teamZelle(meName, oppName) {
        const meSet = teamSet('me', meName), oppSet = teamSet('opp', oppName);
        if (!meSet || !oppSet) return null;
        const meStats = statsOf(meName, meSet), oppStats = statsOf(oppName, oppSet);
        if (!meStats || !oppStats) return null;
        return {
            deal: bestMove(meName, meSet, oppName, oppSet),
            take: bestMove(oppName, oppSet, meName, meSet),
            spd: window.ChampionsDamage.speedComparison(meStats.spe, oppStats.spe),
        };
    }

    /* BEFUND (Abnahme 02.09.2026, unabhaengiger Pruefer):
       Das Urteil las `ko.hits` und liess `ko.chance` daneben liegen.

       koChance() gibt als `hits` die KLEINSTE Trefferzahl zurueck, bei der
       ein K.O. ueberhaupt moeglich ist — die Gluecks­wurfzahl, nicht die
       wahrscheinliche. Der gemessene Fall: Kingambit legt Blastoise
       garantiert in zwei Treffern um, Blastoise schafft das zu 3,9 % —
       beides stand in derselben Zelle, und die Zelle war ROT. Ueber alle
       85.264 Paare des Kaders: in 30 % der farbigen Zellen stuetzte sich
       das Urteil auf eine Zahl, die die Zelle selbst als unwahrscheinlich
       auswies; in 5,4 % sagte die Farbe das Gegenteil des wahrscheinlichen
       Ausgangs.

       Gewertet wird jetzt ueber den DURCHSCHNITTSWURF: wie viele Treffer
       braucht es, wenn die Wuerfe normal ausfallen. Das ist dieselbe
       Spanne, die in der Zelle steht (min–max), und damit die Zahl, die
       der Leser nachrechnen kann.

       Die Gluecks­wurfzahl bleibt die Untergrenze — realistisch kann es
       nie SCHNELLER gehen als im besten Fall. Deshalb das Maximum aus
       beidem. */
    function realistischeTreffer(range) {
        if (!range) return Infinity;
        const min = Number(range.minPct) || 0;
        const max = Number(range.maxPct) || 0;
        // 0 % heisst immun oder wirkungslos: davon stirbt nichts.
        if (!(min > 0) && !(max > 0)) return Infinity;
        const schnitt = (min + max) / 2;
        if (!(schnitt > 0)) return Infinity;
        const ausSchnitt = Math.ceil(100 / schnitt);
        const glueck = (range.ko && range.ko.hits) || 0;
        const treffer = Math.max(ausSchnitt, glueck);
        // Was auch nach KO_MAX_HITS nicht toetet, toetet nicht.
        const deckel = (window.ChampionsDamage && window.ChampionsDamage.KO_MAX_HITS) || 9;
        return treffer > deckel ? Infinity : treffer;
    }

    /* Die Farbe der Zelle sagt, wer das Rennen macht.

       Nicht der Schaden allein entscheidet: 90 % Schaden bei langsamerer
       Initiative ist eine Niederlage, 55 % bei schnellerer ein sauberer
       Zweischlag. Gewertet wird deshalb ueber die Trefferzahl — wer
       weniger braucht, gewinnt; bei Gleichstand entscheidet die
       Initiative, und ein Initiativgleichstand bleibt unentschieden, weil
       er ein Muenzwurf ist. */
    function teamUrteil(z) {
        if (!z) return 'is-leer';
        const meineTreffer = realistischeTreffer(z.deal && z.deal.range);
        const seineTreffer = realistischeTreffer(z.take && z.take.range);
        if (meineTreffer === Infinity && seineTreffer === Infinity) return 'is-patt';
        if (meineTreffer < seineTreffer) return 'is-gut';
        if (meineTreffer > seineTreffer) return 'is-schlecht';
        if (z.spd.tie) return 'is-patt';
        return z.spd.faster ? 'is-gut' : 'is-schlecht';
    }

    function teamPfeil(spd) {
        if (spd.tie) return { z: '=', t: L().teamGleich };
        return spd.faster ? { z: '▲', t: L().teamSchnell }
                          : { z: '▼', t: L().teamLangsam };
    }

    /* Ein Set kann vollstaendig sein und trotzdem nichts austeilen: vier
       Statusattacken machen null Schaden. In der Matrix steht dann ein
       Strich, und ein Strich sieht aus wie ein Fehler. Der Grund gehoert
       an den Chip — dorthin, wo die Ursache sitzt, genauso wie beim
       fehlenden Set. */
    function hatAngriff(set) {
        if (!set) return false;
        return (set.moves || []).some(mn => {
            const mv = moveEntry(mn);
            return !!(mv && Number(mv.power) > 0);
        });
    }

    function teamBank(seite) {
        const liste = seite === 'opp' ? _teamOpp.slice() : _teamMine.map(m => m.name);
        const n = liste.length;
        const aktiv = liste.filter(x => istAktiv(seite, x)).length;
        if (!n) {
            return `<p class="sq-empty">${esc(seite === 'opp' ? L().teamOppEmpty : L().teamMineEmpty)}</p>`;
        }
        const chips = liste.map(name => {
            const an = istAktiv(seite, name);
            const set = teamSet(seite === 'opp' ? 'opp' : 'me', name);
            const hatSet = !!set;
            const stumm = hatSet && !hatAngriff(set);
            const warn = !hatSet ? L().teamKeinSet : (stumm ? L().teamKeineAttacke : '');
            /* Das Kreuz stand bis zur Abnahme INNERHALB des Schalters.
               Ein Bedienelement in einem <button> ist ungueltiges HTML,
               und die Tastatur- und Screenreader-Semantik ist dann
               undefiniert. Beide liegen jetzt nebeneinander in einer
               Gruppe: der Schalter nimmt aus dem Kampf, das Kreuz vom
               Brett. */
            return `<span class="sq-team-chipgruppe${warn ? ' is-ohne-set' : ''}">
                    <button type="button" class="sq-team-chip${an ? ' is-an' : ''}"
                        data-sq-team-toggle="${esc(seite)}" data-sq-team-name="${esc(name)}"
                        aria-pressed="${an ? 'true' : 'false'}"
                        title="${esc(an ? L().teamRemove : L().teamAdd)}">
                        <span class="sq-team-chip-name">${nameHtml(name, 'pokemon')}</span>
                        ${warn ? `<i class="sq-team-chip-warn">${esc(warn)}</i>` : ''}
                    </button>
                    ${seite === 'opp'
                        ? `<button type="button" class="sq-team-chip-weg"
                              data-sq-team-weg="${esc(name)}"
                              title="${esc(L().teamEntfernen)}"
                              aria-label="${esc(L().teamEntfernen)} — ${esc(name)}">×</button>`
                        : ''}
                </span>`;
        }).join('');
        const zuViele = aktiv > TEAM_KAMPF
            ? ` <span class="sq-team-zuviel" title="${esc(L().teamZuVieleTitel)}">${
                  esc(L().teamZuVieleAktiv)}</span>`
            : '';
        return `<div class="sq-team-bank">${chips}</div>
                <p class="sq-team-zaehler">${esc(L().teamAktivVon(aktiv, n))}${zuViele}</p>`;
    }

    function teamSuche() {
        const q = _teamQ.trim().toLowerCase();
        if (!q) return '';
        const drin = new Set(_teamOpp);
        /* Auch der deutsche Name (Abnahme 02.09.2026): die Kadersuche
           eine Ansicht hoeher filtert laengst ueber localName, hier stand
           nur der englische. Im deutschen UI fand "Glurak" oben etwas und
           hier nichts — dasselbe Suchfeld, zwei Ergebnisse. */
        const treffer = _roster
            .filter(r => !drin.has(r.name) && (
                r.name.toLowerCase().includes(q)
                || String(localName(r.name, 'pokemon') || '').toLowerCase().includes(q)))
            .slice(0, 8);
        if (!treffer.length) return `<p class="sq-empty">${esc(L().noHit)}</p>`;
        return `<div class="sq-team-vorschlag">${treffer.map(r =>
            `<button type="button" data-sq-team-add="${esc(r.name)}">${
                nameHtml(r.name, 'pokemon')}</button>`
        ).join('')}</div>`;
    }

    function teamMatrix() {
        const meine = aktiveNamen('me');
        const gegner = aktiveNamen('opp');
        if (!meine.length || !gegner.length) {
            return `<div class="sq-panel"><p class="sq-empty">${esc(L().teamNoneAktiv)}</p></div>`;
        }
        const kopf = gegner.map(o => `<th scope="col">${nameHtml(o, 'pokemon')}</th>`).join('');
        const zeilen = meine.map(m => {
            const zellen = gegner.map(o => {
                const z = teamZelle(m, o);
                if (!z) {
                    return `<td class="sq-team-zelle is-leer"
                                title="${esc(L().teamZelleLeerTitel)}">–</td>`;
                }
                const pf = teamPfeil(z.spd);
                const urteil = teamUrteil(z);
                /* Die Spanne, nicht der Hoechstwurf (Abnahme 02.09.2026).
                   Hier stand nur maxPct — die Einzelansicht zeigt fuer
                   dasselbe Paar "42,5–50,7 %", die Matrix zeigte "50,7 %",
                   ohne dass irgendwo stand, dass das der obere Rand ist.
                   Zwei Ansichten, dieselbe Zahl, zwei Antworten.

                   Und der Attackenname gehoert dazu: eine Prozentzahl
                   ohne die Attacke, aus der sie kommt, kann man nicht
                   nachrechnen. */
                const seite = (m2, klasse, label) => {
                    if (!m2) {
                        return `<span class="${klasse} is-ohne"><i>${esc(label)}</i>
                                <b>–</b><u>${esc(L().noMove)}</u></span>`;
                    }
                    const g = m2.range;
                    // Immunitaet ist nicht "trifft fuer fast nichts".
                    // sideCell eine Ansicht hoeher hat dafuer einen eigenen
                    // Zweig; ohne ihn standen hier 718 Zellen mit "0 %".
                    if (g.effectiveness === 0) {
                        return `<span class="${klasse} is-immun"><i>${esc(label)}</i>
                                <b>${esc(L().immune)}</b><u></u></span>`;
                    }
                    return `<span class="${klasse}"><i>${esc(label)}</i>
                            <b>${esc(num(g.minPct))}–${esc(num(g.maxPct))} %</b>
                            <u>${esc(koLabel(g.ko))}</u>
                            <em title="${esc(localName(m2.name, 'moves'))}">${
                                esc(localName(m2.name, 'moves'))}</em></span>`;
                };
                /* Das Urteil hing allein an einem 3px breiten Farbstreifen.
                   Fuer Rot-Gruen-Schwaeche und fuer Screenreader war die
                   Zelle damit urteilslos. Es steht jetzt zusaetzlich im
                   Titel und als unsichtbarer Text. */
                const urteilTxt = urteil === 'is-gut' ? L().teamUrteilGut
                    : urteil === 'is-schlecht' ? L().teamUrteilSchlecht
                    : urteil === 'is-patt' ? L().teamUrteilPatt : '';
                /* Absprung in die Einzelansicht: die Matrix zeigt je
                   Richtung die STAERKSTE Attacke. Wer wissen will, was die
                   anderen drei machen, oder das Set aendern will, braucht
                   den Rechner darunter — der existiert bereits, es fehlte
                   nur der Weg dorthin. */
                return `<td class="sq-team-zelle ${urteil}" role="button" tabindex="0"
                            data-sq-team-zelle="${esc(o)}" data-sq-team-mein="${esc(m)}"
                            title="${esc(L().teamZelleTitel(m, o))}${
                                urteilTxt ? ' — ' + esc(urteilTxt) : ''} · ${
                                esc(L().teamZuEinzeln)}">
                        <span class="sq-nur-vorlesen">${esc(urteilTxt)}</span>
                        <span class="sq-team-pfeil" title="${esc(pf.t)}">${pf.z}</span>
                        ${seite(z.deal, 'sq-team-deal', L().teamDeal)}
                        ${seite(z.take, 'sq-team-take', L().teamTake)}
                    </td>`;
            }).join('');
            return `<tr><th scope="row">${nameHtml(m, 'pokemon')}</th>${zellen}</tr>`;
        }).join('');
        return `<div class="sq-panel sq-team-matrixwrap">
                <table class="sq-team-matrix">
                    <thead><tr><td></td>${kopf}</tr></thead>
                    <tbody>${zeilen}</tbody>
                </table>
            </div>`;
    }

    function teamCalcHtml() {
        return `<div class="sq-team">
                <p class="sq-team-hinweis">${esc(L().teamHint)}</p>
                <div class="sq-panel">
                    ${sectionLabel(L().teamMine)}
                    ${teamBank('me')}
                </div>
                <div class="sq-panel">
                    ${sectionLabel(L().teamOpp)}
                    <input type="search" class="sq-input" id="sqTeamSuche"
                           placeholder="${esc(L().teamPickOpp)}"
                           aria-label="${esc(L().teamPickOpp)}"
                           value="${esc(_teamQ)}"${_teamOpp.length >= TEAM_MAX ? ' disabled' : ''}>
                    ${teamSuche()}
                    ${teamBank('opp')}
                </div>
                ${teamMatrix()}
                ${noteHtml(true)}
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
        const back = (_calc || _teamAn)
            ? `<button type="button" class="sq-btn sq-back" data-sq-back>${
                  esc(_teamAn ? L().teamBack : L().back)}</button>`
            : '';
        // Der Knopf in den Team-Rechner steht nur da, wo er etwas tut:
        // in der Matchup-Liste, nicht im Rechner selbst.
        const teamBtn = (!_calc && !_teamAn)
            ? `<button type="button" class="sq-btn" data-sq-team-open>${esc(L().teamOffen)}</button>`
            : '';
        const marke = _teamAn ? L().teamCalc : (_calc ? L().calc : L().brand);
        host.innerHTML = `
            <div class="sq-console">
                <div class="sq-top">
                    <span class="sq-brand">Champions <span>${esc(marke)}</span></span>
                    ${back}${teamBtn}
                    <span class="sq-spacer"></span>
                    <span class="sq-seg">${seg('doubles', L().doubles)}${seg('singles', L().singles)}</span>
                </div>
                ${_teamAn ? teamCalcHtml() : (_calc ? calcHtml() : `<div class="sq-grid">
                    <div class="sq-col-pick">${rosterHtml()}</div>
                    <div class="sq-col-set">${_me && setFor(_me, 'me')
                        ? setEditor('me', _me, setFor(_me, 'me'), L().set)
                        : `<div class="sq-panel"><p class="sq-empty">${esc(L().pickMon)}</p></div>`}</div>
                    <div class="sq-col-table">${tableHtml()}</div>
                </div>`)}
            </div>`;
        wire(host);
    }

    function editorTarget(side) {
        const name = side === 'opp' ? _calc : _me;
        return { name, set: name ? setFor(name, side) : null };
    }

    /* EIN ZUHOERER JE ELEMENT UND EREIGNIS (05.09.2026).

       Live gemessen auf thedipidis.app: beim Tippen von "Charizar" ins
       Suchfeld dauerte das input-Ereignis 1, 1, 1, 2, 1, 3, 6, 8 ms —
       eine Verdopplung je Tastendruck. Danach das Feld leeren (200
       Zeilen): 813 ms in EINEM Ereignis; in einer zweiten Messung
       1.878 ms fuer einen einzelnen Tastendruck, mit haengendem
       Hauptfaden.

       Ursache: der input-Zuhoerer unten ruft `wire(...)` erneut auf,
       und `wire` hing seinen eigenen Zuhoerer wieder an DASSELBE
       Eingabefeld. Jedes Ereignis rief alle vorhandenen Zuhoerer, jeder
       rief `wire` — 2^n nach n Zeichen. Nach acht Zeichen liefen 256
       vollstaendige Neuaufbauten der Liste je Tastendruck.

       Zwei Riegel, beide noetig: `wire` wird nur noch auf den wirklich
       ersetzten Teilbaum angewendet, UND jede Bindung merkt sich am
       Element, dass sie schon steht. Der zweite Riegel haelt auch
       dann, wenn spaeter jemand die Struktur umbaut. */
    function binde(el, typ, fn) {
        if (!el) return;
        const marke = '_sqGebunden_' + typ;
        if (el.dataset && el.dataset[marke] === '1') return;
        if (el.dataset) el.dataset[marke] = '1';
        el.addEventListener(typ, fn);
    }

    function wire(host) {
        host.querySelectorAll('[data-sq-format]').forEach(b => {
            binde(b, 'click', () => {
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
            binde(r, 'click', pick);
            binde(r, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
            });
        });
        host.querySelectorAll('[data-sq-opp]').forEach(r => {
            const open = () => { _calc = r.getAttribute('data-sq-opp'); render(); };
            binde(r, 'click', open);
            binde(r, 'keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
            });
        });
        const backBtn = host.querySelector('[data-sq-back]');
        if (backBtn) backBtn.addEventListener('click', () => {
            if (_teamAn) { _teamAn = false; _teamQ = ''; } else { _calc = null; }
            render();
        });
        wireTeam(host);

        const more = host.querySelector('[data-sq-more]');
        binde(more, 'click', () => { _limit += ROSTER_STEP; render(); });

        const typeSel = host.querySelector('[data-sq-opptype]');
        binde(typeSel, 'change', () => {
            _oppType = typeSel.value; _limit = ROSTER_STEP; render();
        });

        host.querySelectorAll('[data-sq-sort]').forEach(b => {
            binde(b, 'click', () => {
                _sort = b.getAttribute('data-sq-sort'); _limit = ROSTER_STEP; render();
            });
        });

        // Die Suche darf nicht neu rendern — sonst verliert das Feld nach
        // dem ersten Buchstaben den Fokus. Nur die Liste wird ersetzt.
        const q = host.querySelector('[data-sq-q]');
        if (q) {
            binde(q, 'input', () => {
                _q = q.value;
                const panel = q.closest('.sq-panel');
                const list = panel && panel.querySelector('.sq-mu-list');
                if (!list) return;
                const tmp = document.createElement('div');
                tmp.innerHTML = rosterHtml();
                const fresh = tmp.querySelector('.sq-mu-list');
                // Nur der ersetzte Teilbaum wird neu verdrahtet — das
                // Suchfeld selbst steht ausserhalb von .sq-mu-list und
                // behaelt seinen einen Zuhoerer.
                if (fresh) { list.innerHTML = fresh.innerHTML; wire(list); }
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

    /* Die Klickpfade des Team-Rechners.

       Das Kreuz auf einem Gegner-Chip nimmt ihn vom Brett, ein Klick auf
       den Chip selbst schaltet ihn nur aus dem Kampf. Das sind zwei
       verschiedene Dinge: ausgeschaltet bleibt er in den sechs, entfernt
       ist er weg. Damit das Kreuz nicht ausserdem den Chip umschaltet,
       hoert es die Blase ab. */
    function wireTeam(host) {
        host.querySelectorAll('[data-sq-team-open]').forEach(b => {
            b.addEventListener('click', () => { _teamAn = true; _calc = null; render(); });
        });
        host.querySelectorAll('[data-sq-team-weg]').forEach(x => {
            x.addEventListener('click', () => {
                const name = x.getAttribute('data-sq-team-weg');
                _teamOpp = _teamOpp.filter(n => n !== name);
                ausSet('opp').delete(name);
                render();
            });
        });
        host.querySelectorAll('[data-sq-team-zelle]').forEach(td => {
            const auf = () => {
                _me = td.getAttribute('data-sq-team-mein');
                _calc = td.getAttribute('data-sq-team-zelle');
                _teamAn = false;
                render();
            };
            td.addEventListener('click', auf);
            td.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); auf(); }
            });
        });
        host.querySelectorAll('[data-sq-team-toggle]').forEach(b => {
            b.addEventListener('click', () => {
                const seite = b.getAttribute('data-sq-team-toggle');
                const name = b.getAttribute('data-sq-team-name');
                const aus = ausSet(seite);
                if (aus.has(name)) aus.delete(name); else aus.add(name);
                render();
            });
        });
        host.querySelectorAll('[data-sq-team-add]').forEach(b => {
            b.addEventListener('click', () => {
                const name = b.getAttribute('data-sq-team-add');
                if (_teamOpp.length >= TEAM_MAX || _teamOpp.indexOf(name) !== -1) return;
                _teamOpp.push(name);
                _teamQ = '';
                render();
            });
        });
        const suche = host.querySelector('#sqTeamSuche');
        if (suche) {
            suche.addEventListener('input', () => {
                _teamQ = suche.value;
                render();
                // Nach dem Neuzeichnen ist das Feld ein anderes Element.
                // Ohne das hier verliert es bei jedem Tastendruck den
                // Fokus und man kann genau einen Buchstaben tippen.
                const neu = document.querySelector('#sqTeamSuche');
                if (neu) { neu.focus(); neu.setSelectionRange(neu.value.length, neu.value.length); }
            });
        }
    }

    /* Uebergabe aus dem Team-Builder.

       `team` ist die Form, die alsTeamObjekt() dort schon liefert:
       { mons: [{ name, nature, moves, evs, item, ability }] }. Die
       Verteilung kommt als Champions-Text ("HP 12 / Atk 32 / ...") und
       wird hier in die Form gebracht, die statsOf() erwartet. Ein Bau
       ohne verwertbares Set faellt nicht heraus — er landet mit
       set: null in der Bank und traegt dort sichtbar "kein Set", statt
       stillschweigend zu fehlen. */
    /* BEFUND (Abnahme 02.09.2026): hier stand ein ZWEITER Parser.

       js/champions-set.js:108 hat mit parseSpread laengst genau diesen —
       inklusive der deutschen Kuerzel (KP/ANG/VER/SPV/INI) und der
       Langform "Sp. Atk", die der hiesige nicht lesen konnte. Das ist
       derselbe Fehler, den der Kopf dieser Datei fuer die RECHNUNG
       ausschliesst: zwei Wege zu derselben Antwort, und irgendwann geben
       sie zwei verschiedene.

       Der eigene Weg bleibt nur als Rueckfall, wenn ChampionsSet nicht
       geladen ist (Tests, die das Modul einzeln laden) — und er versteht
       dann wenigstens dieselben Kuerzel. */
    const SP_ALIAS = {
        hp: 'hp', kp: 'hp',
        atk: 'atk', ang: 'atk', attack: 'atk',
        def: 'def', ver: 'def', defense: 'def',
        spa: 'spa', spatk: 'spa', spattack: 'spa',
        spd: 'spd', spv: 'spd', spdef: 'spd',
        spe: 'spe', ini: 'spe', speed: 'spe',
    };

    function CS() { return window.ChampionsSet || null; }

    function spreadAusText(text) {
        const cs = CS();
        if (cs && typeof cs.parseSpread === 'function') return cs.parseSpread(text);
        const sp = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        String(text || '').split('/').forEach(teil => {
            const t = teil.trim();
            const m = t.match(/^(\d+)\s+(.+)$/) || t.match(/^(.+?)\s+(\d+)$/);
            if (!m) return;
            const zahl = /^\d+$/.test(m[1]) ? Number(m[1]) : Number(m[2]);
            const wort = /^\d+$/.test(m[1]) ? m[2] : m[1];
            const k = SP_ALIAS[String(wort).replace(/[\s.]/g, '').toLowerCase()];
            if (k) sp[k] = zahl;
        });
        return sp;
    }

    /* 32 je Wert, Summe 66 — dieselbe Klammer, die der Builder an jedem
       Regler zieht. Sie fehlte hier, und oeffneTeamRechner ist eine
       oeffentliche window-Schnittstelle: ein Aufrufer mit "252 Atk"
       haette einen Angriffswert von 447 statt 205 gerechnet bekommen,
       und die Zahl haette echt ausgesehen. */
    function klammereSpread(sp) {
        const cs = CS();
        if (cs && typeof cs.clampSpread === 'function') return cs.clampSpread(sp);
        return clampAlle(sp);
    }

    function clampAlle(sp) {
        const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
        let rest = SP_BUDGET;
        ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach(k => {
            const v = Math.max(0, Math.min(Number(sp && sp[k]) || 0, SP_MAX, rest));
            out[k] = v;
            rest -= v;
        });
        return out;
    }

    /* BEFUND (Abnahme 02.09.2026): der Name kam aus dem falschen Namensraum.

       Der Builder schreibt Showdown-Namen ("Zoroark-Hisui"), _dex ist ueber
       die Anzeigenamen aus champions_pokedex.json verschluesselt ("Hisuian
       Zoroark"). 25 von 238 Nutzungs-Slugs — saemtliche Regionalformen —
       kamen als leere Zeile an, und der Chip trug keine Warnung, weil das
       uebergebene Set ja da war. Genau der "ein Strich sieht aus wie ein
       Fehler"-Fall.

       Aufgeloest wird ueber den Slug, den beide Seiten fuehren. Ist keiner
       dabei (fremde Aufrufer der oeffentlichen Schnittstelle), wird der
       Name direkt gegen _dex gehalten. Trifft auch das nicht, bleibt der
       Name stehen — und der Chip sagt es, statt still zu schweigen. */
    function nameAusSlug(slug) {
        if (!slug || !_roster) return null;
        const ziel = String(slug).toLowerCase();
        const treffer = _roster.find(r => usageSlug(r.name) === ziel);
        return treffer ? treffer.name : null;
    }

    function loeseNamen(m) {
        const ausSlug = nameAusSlug(m.slug);
        if (ausSlug) return ausSlug;
        if (m.name && _dex[m.name]) return m.name;
        // Der Showdown-Name als Slug gelesen ist der letzte Versuch:
        // "Zoroark-Hisui" -> "zoroark-hisui" findet den Nutzungseintrag.
        const alsSlug = nameAusSlug(String(m.name || '').toLowerCase());
        return alsSlug || m.name;
    }

    function uebernimmTeam(team) {
        const mons = (team && team.mons) || [];
        _teamMine = mons.filter(m => m && m.name).slice(0, TEAM_MAX).map(m => {
            const moves = (m.moves || []).filter(Boolean).slice(0, 4);
            const hatBau = !!(m.nature || moves.length);
            const name = loeseNamen(m);
            return {
                name,
                set: hatBau ? {
                    nature: m.nature || 'Hardy',
                    ability: m.ability || '',
                    item: m.item || '',
                    moves,
                    // Geklammert wie im Builder: 32 je Wert, Summe 66.
                    // Ohne das koennte ein fremder Aufrufer der
                    // oeffentlichen Schnittstelle Werte hereingeben, die
                    // es in Champions nicht gibt (252 Atk ergaebe 447
                    // statt 205), und der Rechner rechnete sie brav durch.
                    spread: klammereSpread(spreadAusText(m.evs)),
                } : null,
            };
        });
        _teamAusMine = new Set();
        _teamAusOpp = new Set();
        _teamOpp = [];
        _teamQ = '';
        _teamAn = true;
        _calc = null;
    }

    /* Von aussen aufgerufen (Team-Builder). Die Ansicht muss dabei erst
       sichtbar gemacht werden — sonst rechnet der Rechner in einem
       versteckten Kasten, und der Klick sieht wie ein Fehlschlag aus. */
    function oeffneTeamRechner(team) {
        uebernimmTeam(team);
        if (window.sideQuestResources && typeof window.sideQuestResources.showView === 'function') {
            window.sideQuestResources.showView('matchups');
        }
        activate();
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

    window.sideQuestMatchups = { activate, oeffneTeamRechner };
    window._sqMatchupInternals = {
        setData, topSet, clampSpread, spreadTotal, buildRoster, usageSlug,
        moveTable, bestMove, koLabel, effLabel, statsOf, matchup,
        SP_MAX, SP_BUDGET,
        // Team-Rechner: fuer die Tests einzeln greifbar, damit die
        // Urteilsregel und die Spread-Uebernahme geprueft werden koennen,
        // ohne den ganzen Renderer zu starten.
        TEAM_MAX, TEAM_KAMPF,
        teamUrteil, teamZelle, teamSet, spreadAusText, uebernimmTeam, hatAngriff,
        realistischeTreffer, teamCalcHtml, teamMatrix, teamBank, wireTeam,
        klammereSpread, loeseNamen, nameAusSlug, teamSuche,
        teamQ: (v) => { _teamQ = v; },
        aktiveNamen, istAktiv, ausSet,
        teamState: (patch) => {
            if (!patch) return { mine: _teamMine, opp: _teamOpp, an: _teamAn };
            if (patch.mine) _teamMine = patch.mine;
            if (patch.opp) _teamOpp = patch.opp;
            if (patch.an != null) _teamAn = patch.an;
            if (patch.reset) { _teamAusMine = new Set(); _teamAusOpp = new Set(); }
            return { mine: _teamMine, opp: _teamOpp, an: _teamAn };
        },
        state: (patch) => { if (patch && patch.format) _format = patch.format;
                            if (patch && patch.me) _me = patch.me; },
    };
})();
