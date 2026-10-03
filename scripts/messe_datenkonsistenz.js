/*
 * Datenkonsistenz-Messung thedipidis.app (Agent 3 / Datenanalyst, 03.10.2026)
 * ------------------------------------------------------------------------
 * Aufruf: im angemeldeten oder abgemeldeten Tab von https://thedipidis.app
 * (beliebiger Reiter, Startseite empfohlen) den ganzen Inhalt in die
 * Konsole bzw. per javascript_tool einfügen. Liest NUR /data/... und das DOM,
 * schreibt nichts (kein localStorage, kein Firestore).
 *
 * Ergebnis: ein Objekt mit
 *   anteile   – Online-/Major-Anteil je Archetyp aus allen Quellen, die die
 *               Seite lädt (Nenner jeweils mit angegeben)
 *   quoten    – Win-Rate je Konvention (S/(S+N+U), S/(S+N), Matchpunkte)
 *   heatmap   – Abgleich aller sichtbaren Heatmap-Zellen gegen Rohbilanz
 *               (roh und geglättet K=20); nur wenn #current-meta gerendert ist
 *   symmetrie – A-vs-B gegen B-vs-A in beiden Matchup-Dateien
 *   preise    – Preisstatus der Kartendatenbank (wenn allCardsDatabase geladen)
 *   laden     – /data/-Dateien dieses Seitenaufrufs, Größe, Mehrfachladungen
 */
(async () => {
  const DECKS = ['Dragapult', "N's Zoroark", 'Slowking', 'Dragapult Dusknoir', 'Basic Box'];
  const holen = (f) => fetch('/data/' + f, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
  const csv = (t, sep) => {
    const L = t.replace(/^﻿/, '').replace(/^#[^\n]*\n/, '').trim().split(/\r?\n/);
    const zerlege = (l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') { q = !q; continue; } if (ch === sep && !q) { o.push(c); c = ''; continue; } c += ch; } o.push(c); return o; };
    const h = zerlege(L[0]);
    return L.slice(1).map(l => { const v = zerlege(l); const o = {}; h.forEach((k, i) => { o[k] = v[i]; }); return o; });
  };
  const zahl = (s) => parseFloat(String(s ?? '').replace(',', '.'));
  const r1 = (x) => Math.round(x * 10) / 10;
  const quoten = (s, n, u) => ({ mitU: r1(s / (s + n + u) * 100), ohneU: r1(s / (s + n) * 100), matchpunkte: r1((3 * s + u) / (3 * (s + n + u)) * 100) });

  const [lod, top8, fenster, labs, lbM, onM, prog] = await Promise.all([
    holen('limitless_online_decks.csv').then(t => csv(t, ';')),
    holen('online_tournament_top8_decks.csv').then(t => csv(t, ';')),
    holen('limitless_online_fenster.csv').then(t => csv(t, ';')),
    holen('labs_tournament_decks_TEF-30C.csv').then(t => csv(t, ',')),
    holen('labs_tournament_matchups_TEF-30C.csv').then(t => csv(t, ',').filter(r => r.day_filter === 'overall')),
    holen('limitless_online_decks_matchups.csv').then(t => csv(t, ';')),
    holen('meta_prognose.json').then(t => JSON.parse(t)),
  ]);

  const lodNenner = lod.length ? zahl(lod[0].count) / zahl(lod[0].share_numeric) * 100 : NaN;
  const top8Nenner = top8.reduce((s, r) => s + (+r.total_brought || 0), 0);
  const labsNenner = [...new Set(labs.map(r => r.tournament_id))].reduce((s, id) => s + +labs.find(r => r.tournament_id === id).total_players, 0);

  const anteile = {}, quotenAus = {};
  for (const d of DECKS) {
    const a = lod.find(r => r.deck_name === d) || {};
    const t = top8.find(r => r.deck_name === d) || {};
    const f = fenster.find(r => r.deck_name === d) || {};
    const p = (prog.prognose || []).find(r => r.archetyp_name === d) || {};
    const lz = labs.filter(r => r.deck_name === d);
    const sum = (k) => lz.reduce((s, r) => s + (+r[k] || 0), 0);
    anteile[d] = {
      online_kumulativ: `${r1(zahl(a.share_numeric))} % (${a.count}/${Math.round(lodNenner)})`,
      online_antritte_top8datei: t.total_brought ? `${r1(t.total_brought / top8Nenner * 100)} % (${t.total_brought}/${top8Nenner})` : '—',
      online_fenster: f.share_fenster ? `${f.share_fenster} % (${f.count_fenster})` : '—',
      online_14tage_prognose: p.online_anteil != null ? `${r1(p.online_anteil)} % (${p.online_listen}/${p.online_listen_gesamt})` : '—',
      prognose: p.prognose != null ? `${r1(p.prognose)} % (${r1(p.prognose_von)}–${r1(p.prognose_bis)})` : '—',
      major: `${r1(sum('player_count') / labsNenner * 100)} % (${sum('player_count')}/${labsNenner})`,
      top8quote_online: t.top8_count ? `${r1(t.top8_count / t.total_brought * 100)} %` : '—',
      day2quote_major: sum('player_count') ? `${r1(sum('day2_players') / sum('player_count') * 100)} %` : '—',
    };
    quotenAus[d] = {
      online: quoten(+a.wins, +a.losses, +a.ties),
      major: quoten(sum('wins'), sum('losses'), sum('ties')),
      bilanz_major: `${sum('wins')}-${sum('losses')}-${sum('ties')}`,
    };
  }

  // Heatmap: sichtbare Zellen gegen Rohbilanz
  let heatmap = 'Heatmap nicht gerendert';
  const hm = document.querySelector('#current-meta table.heatmap-table');
  if (hm) {
    const kopf = [...hm.rows[0].cells].map(c => c.innerText.trim());
    let n = 0, maxOnRoh = 0, maxOnGl = 0, maxMaRoh = 0, maxMaGl = 0, klein = 0;
    for (let i = 1; i < hm.rows.length; i++) {
      const a = hm.rows[i].cells[0].innerText.trim();
      for (let j = 1; j < hm.rows[i].cells.length; j++) {
        const txt = hm.rows[i].cells[j].innerText.replace(/\s+/g, ' ');
        const z = txt.match(/\d+,\d/g); if (!z) continue; n++;
        const b = kopf[j];
        const o = onM.find(r => r.deck_name === a && r.opponent === b);
        const l = lbM.find(r => r.my_deck_name === a && r.opponent_deck_name === b);
        if (o) { const [w, lo] = o.record.split(' - ').map(Number); maxOnRoh = Math.max(maxOnRoh, Math.abs(zahl(z[0]) - w / (w + lo) * 100)); maxOnGl = Math.max(maxOnGl, Math.abs(zahl(z[0]) - (w + 10) / (w + lo + 20) * 100)); if (w + lo < 20) klein++; }
        if (l && z[1]) { const w = +l.vs_wins, lo = +l.vs_losses; maxMaRoh = Math.max(maxMaRoh, Math.abs(zahl(z[1]) - w / (w + lo) * 100)); maxMaGl = Math.max(maxMaGl, Math.abs(zahl(z[1]) - (w + 10) / (w + lo + 20) * 100)); if (w + lo < 20) klein++; }
      }
    }
    heatmap = { zellen: n, max_abw_online_roh: r1(maxOnRoh), max_abw_online_geglaettet: Math.round(maxOnGl * 100) / 100, max_abw_major_roh: r1(maxMaRoh), max_abw_major_geglaettet: Math.round(maxMaGl * 100) / 100, zellen_unter_20_entschiedenen: klein };
  }

  // Symmetrie
  let symOn = 0, symOnAbw = 0;
  const onIdx = new Map(onM.map(r => [r.deck_name + '|' + r.opponent, r]));
  onM.forEach(r => { const g = onIdx.get(r.opponent + '|' + r.deck_name); if (g && r.deck_name < r.opponent) { symOn++; if (Math.abs(zahl(r.win_rate) + zahl(g.win_rate) - 100) > 0.05) symOnAbw++; } });
  let symLb = 0, symLbAbw = 0;
  const lbIdx = new Map(lbM.map(r => [r.my_deck_name + '|' + r.opponent_deck_name, r]));
  lbM.forEach(r => { const g = lbIdx.get(r.opponent_deck_name + '|' + r.my_deck_name); if (g && r.my_deck_name < r.opponent_deck_name) { symLb++; if (r.vs_wins !== g.vs_losses || r.vs_losses !== g.vs_wins || r.vs_ties !== g.vs_ties) symLbAbw++; } });

  // Kartendatenbank-Preise
  let preise = 'allCardsDatabase nicht geladen (Reiter Kartendatenbank öffnen)';
  if (Array.isArray(window.allCardsDatabase) && window.allCardsDatabase.length) {
    const db = window.allCardsDatabase, st = {}, alt = {};
    db.forEach(c => { st[c.price_status || '(leer)'] = (st[c.price_status || '(leer)'] || 0) + 1; if (c.price_status === 'stale') { const m = String(c.price_last_updated || '').slice(0, 7); alt[m] = (alt[m] || 0) + 1; } });
    preise = { karten: db.length, status: st, stale_nach_monat: alt };
  }

  // Ladeleistung dieses Seitenaufrufs
  const m = {};
  performance.getEntriesByType('resource').filter(e => e.name.includes('/data/')).forEach(e => {
    const k = e.name.replace(location.origin, '').split('?')[0];
    m[k] = m[k] || { n: 0, mb: 0 }; m[k].n++; m[k].mb += e.decodedBodySize / 1e6;
  });
  const laden = {
    dateien: Object.keys(m).length,
    summe_mb: r1(Object.values(m).reduce((s, v) => s + v.mb, 0)),
    groesste: Object.entries(m).sort((a, b) => b[1].mb - a[1].mb).slice(0, 5).map(([k, v]) => `${k} ${v.mb.toFixed(1)} MB ×${v.n}`),
    mehrfach: Object.entries(m).filter(([, v]) => v.n > 1).map(([k, v]) => `${k} ×${v.n}`),
  };

  return { stand: (await fetch('/version.json?x=' + Date.now(), { cache: 'no-store' }).then(r => r.json())).version, anteile, quoten: quotenAus, heatmap, symmetrie: { online_paare: symOn, online_abweichend: symOnAbw, major_paare: symLb, major_abweichend: symLbAbw }, preise, laden };
})();
