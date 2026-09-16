// Side Quest · Schwächen-Ausgleich (Doppelkampf)
// ============================================================================
// ANLASS (Betreiber, 16.09.2026):
//   „bei passt dazu haben wir weiterhin nur die Pokemon die damit gespielt
//    werden, sollte nicht noch dazu kommen vorschlag nach Pokemon die die
//    Schwächen ausgleichen"
//
// „Passt dazu" beantwortet eine Frage über GEWOHNHEIT: mit wem wird dieses
// Pokémon zusammen gespielt. Diese Datei beantwortet eine Frage über
// WIRKUNG: wogegen verliert meine Auswahl, und wer schlägt genau das.
//
// WAS HIER RECHNUNG IST UND WAS BELEG
// -----------------------------------
// Beleg (alles aus den Daten, nichts geschätzt):
//   • Satz je Pokémon  — data/champions_usage.json, jeweils der oberste
//     Eintrag der Rangliste für Attacken (4), Item, Fähigkeit, Wesen und
//     Verteilung. Quelle: championsbattledata.com, In-Game-Nutzungsanalyse.
//   • Basiswerte        — data/champions_pokedex.json
//   • Attackenwerte     — data/champions_resources.json (+ Merkmale aus
//     data/champions_move_flags.json, geparst aus Showdowns moves.ts)
//   • Typentabelle      — data/champions_type_chart.json (Spielregeln)
//   • Verbreitung       — auf wie vielen Teamkameraden-Listen ein Pokémon
//     steht (dieselbe Zahl, nach der „Passt dazu" ohne Auswahl sortiert)
//
// Rechnung (unser Schadensmodell, KEIN Spielergebnis):
//   „A schlägt B" heißt hier: A setzt B mit seiner stärksten Attacke in
//   weniger Treffern um, als B dafür braucht — bei Gleichstand entscheidet
//   die Initiative. Wer B gar nicht umsetzen kann, schlägt B nicht.
//
// Es gibt in den Daten KEINE Siegquoten Pokémon gegen Pokémon. Diese
// Rechnung ersetzt sie nicht, und die Oberfläche muss das so sagen.
(function () {
    'use strict';

    const KAPPE_DROHUNG = 8;    // so viele Bedrohungen tragen die Empfehlung
    const MOVE_SLOTS = 4;

    function CD() { return window.ChampionsDamage; }
    function slugify(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, '-'); }
    function erste(liste) { return (liste && liste[0] && liste[0].name) || ''; }

    /** Baut aus den vier Dateien die Kampfliste.
     *
     *  Rückgabe: { liste, bySlug, ohneDex, verbreitung, chart }
     *  `ohneDex` ist die Lücke und wird BENANNT statt stillschweigend
     *  weggelassen — gemessen am 16.09.2026: 17 von 264 Arten der
     *  Nutzungsdatei stehen nicht im Pokédex (der Kader der Quelle
     *  otterlyclueless/pokemon-champions-data führt sie nicht, obwohl
     *  die Nutzungsanalyse für sie vollständige Sätze hat). Sie können
     *  deshalb weder Bedrohung noch Ausgleicher sein.
     */
    function baueKader(usage, dexEntries, moves, chart) {
        const byEn = {};
        (dexEntries || []).forEach(e => { if (e && e.en && !byEn[e.en]) byEn[e.en] = e; });

        const verbreitung = {};
        Object.keys(usage || {}).forEach(s => {
            const b = (usage[s] && usage[s].doubles) || {};
            (b.teammate || []).forEach(t => {
                const k = slugify(t && t.name);
                if (k) verbreitung[k] = (verbreitung[k] || 0) + 1;
            });
        });

        const liste = [];
        const bySlug = {};
        const ohneDex = [];
        Object.keys(usage || {}).forEach(slug => {
            const u = usage[slug] || {};
            const b = u.doubles;
            const e = byEn[u.name];
            if (!b || !e) { ohneDex.push(slug); return; }
            const sp = (b.stat_points && b.stat_points[0] && b.stat_points[0].points) || {};
            const attacken = ((b.move) || []).slice(0, MOVE_SLOTS)
                .map(m => moves[m.name]).filter(m => m && m.power);
            const bau = {
                slug,
                name: u.name,
                stats: CD().buildStats(e, sp, erste(b.nature) || 'Hardy'),
                types: [e.t1, e.t2].filter(Boolean),
                ability: erste(b.ability),
                item: erste(b.held_item),
                moves: attacken,
                verbreitung: verbreitung[slug] || 0,
            };
            liste.push(bau);
            bySlug[slug] = bau;
        });
        return { liste, bySlug, ohneDex, verbreitung, chart };
    }

    /** Die stärkste Attacke von a gegen d — oder null, wenn keine trifft. */
    function besteAttacke(a, d, chart, merk) {
        const k = a.slug + '>' + d.slug;
        if (merk.has(k)) return merk.get(k);
        let best = null;
        for (let i = 0; i < a.moves.length; i++) {
            const mv = a.moves[i];
            const r = CD().damageRange({
                move: mv,
                attackerStats: a.stats,
                defenderStats: d.stats,
                attackerTypes: a.types,
                effectiveness: chart(mv.type, d.types),
                attacker: { ability: a.ability, item: a.item },
                defender: { ability: d.ability, item: d.item },
                field: { doubles: true },
                spread: mv.spread === true,
            });
            if (!r || r.effectiveness === 0) continue;
            if (!best || r.max > best.range.max) best = { move: mv, range: r };
        }
        merk.set(k, best);
        return best;
    }

    /** Schlägt a das Pokémon d? Siehe Kopfkommentar für die Definition. */
    function schlaegt(a, d, chart, merk) {
        const hin = besteAttacke(a, d, chart, merk);
        const zurueck = besteAttacke(d, a, chart, merk);
        const ha = (hin && hin.range.ko) ? hin.range.ko.hits : null;
        const hd = (zurueck && zurueck.range.ko) ? zurueck.range.ko.hits : null;
        if (ha == null) return false;
        if (hd == null) return true;
        if (ha < hd) return true;
        return ha === hd && a.stats.spe > d.stats.spe;
    }

    /** Die ganze Auswertung für eine Auswahl.
     *
     *  @param kader   Ergebnis von baueKader()
     *  @param slugs   die gewählten Slugs
     *  @param opts    { kappe } — wie viele Bedrohungen tragen sollen
     *  @return { drohungen, ausgleicher, gewaehlt, ohneDex }
     */
    function analyse(kader, slugs, opts) {
        const kappe = (opts && opts.kappe) || KAPPE_DROHUNG;
        const merk = new Map();
        const chart = kader.chart;
        const gewaehlt = (slugs || []).map(s => kader.bySlug[s]).filter(Boolean);
        if (!gewaehlt.length) {
            return { drohungen: [], ausgleicher: [], gewaehlt: [], ohneDex: kader.ohneDex };
        }
        const drin = new Set(gewaehlt.map(g => g.slug));

        let drohungen = [];
        kader.liste.forEach(o => {
            if (drin.has(o.slug)) return;
            const opfer = gewaehlt.filter(g => schlaegt(o, g, chart, merk)).map(g => g.slug);
            if (opfer.length) {
                drohungen.push({
                    slug: o.slug, name: o.name, opfer,
                    wen: opfer.length, verbreitung: o.verbreitung,
                });
            }
        });
        /* GEWICHTET, NICHT NUR GEZAEHLT.
           Erst sortierte diese Liste nach „schlaegt wie viele meiner
           Pokemon" allein. Gemessen am 16.09.2026 an einem Sechserteam
           stand damit Hydrapple (steht auf 2 Teamkameraden-Listen) vor
           Incineroar (154) — richtig gezaehlt, aber als Empfehlung
           unbrauchbar: gebaut wird gegen das, was man wirklich trifft.
           Das Gewicht ist deshalb „wie viele schlaegt es MAL wie oft
           steht es auf einer Liste". Beide Faktoren stehen in den
           Daten; geschaetzt ist daran nichts. */
        drohungen.forEach(d => { d.gewicht = d.wen * d.verbreitung; });
        drohungen.sort((a, b) => b.gewicht - a.gewicht || b.wen - a.wen
            || b.verbreitung - a.verbreitung || a.name.localeCompare(b.name));
        drohungen = drohungen.slice(0, kappe);

        const ausgleicher = [];
        kader.liste.forEach(p => {
            if (drin.has(p.slug)) return;
            const geschlagen = drohungen
                .filter(d => schlaegt(p, kader.bySlug[d.slug], chart, merk))
                .map(d => d.slug);
            if (geschlagen.length) {
                ausgleicher.push({
                    slug: p.slug, name: p.name, gegen: geschlagen,
                    n: geschlagen.length, von: drohungen.length,
                    verbreitung: p.verbreitung,
                });
            }
        });
        ausgleicher.sort((a, b) => b.n - a.n || b.verbreitung - a.verbreitung
            || a.name.localeCompare(b.name));

        return { drohungen, ausgleicher, gewaehlt, ohneDex: kader.ohneDex };
    }

    window.ChampionsSchwaechen = {
        baueKader, analyse, schlaegt, besteAttacke, KAPPE_DROHUNG,
    };
})();
