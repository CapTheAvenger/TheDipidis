/*
 * Inventur-Messung thedipidis.app (WZ-30, UI/UX-Überprüfung v2, 04.10.2026)
 * ------------------------------------------------------------------------
 * Aufruf: im Tab von https://thedipidis.app den ganzen Inhalt per
 * javascript_tool / Konsole einfügen. Danach steht window.__inventur bereit:
 *
 *   await __inventur.ansicht('current-meta')        // eine Hauptansicht
 *   await __inventur.ansicht('profile', 'decks')    // Profil-Unterreiter
 *   await __inventur.alle()                         // alle Ansichten, Tabelle
 *   __inventur.nutzerdaten()                        // Zählung Firestore (nur lesen)
 *
 * Misst je Ansicht (nur lesen, schreibt nichts außer dem Reiterwechsel):
 *   knoepfe        sichtbare Bedienelemente (button, a, [onclick], select, input-Knöpfe)
 *   nurTitel       Knöpfe ohne sichtbaren Text, nur title (auf Touch unsichtbar)
 *   unbeschriftet  Knöpfe ohne Text, title und aria-label
 *   klein44        sichtbare Knöpfe mit Breite oder Höhe < 44 px
 *   englisch       sichtbare Texte mit typischen englischen Bedienwörtern
 *   platzhalter    {QUOTE}, undefined, NaN, null, BITTE_EINTRAGEN im sichtbaren Text
 *   prozente       Anzahl sichtbarer Prozentwerte
 *   schriftgroessen / farben  Zahl verschiedener Schriftgrößen und Textfarben
 *   hoehe          Höhe der Ansicht in px
 *   ladeMB         /data/-Dateien seit Seitenaufruf (dekodiert, MB) — nur je Seitenaufruf sinnvoll
 */
(() => {
  const sichtbar = (e) => {
    if (!e || !e.getBoundingClientRect) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    }
    return true;
  };
  const text = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
  const KNOPF = 'button, a[href], a[onclick], [role="button"], [onclick], select, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], summary';
  // Englische Bedienwörter — Szenesprache (Win/Loss/Tie, Share, Consistency, Going First,
  // Staples, Supporter/Item/Tool, Meta, Deck, Matchup, Tier, Top 8, Day 2) ist ausgenommen.
  const EN = /\b(Save|Cancel|Delete|Remove|Add to|Show more|Show less|Load more|Loading|Search|Settings|Select|Close|Back|Next|Previous|Copy|Export all|Import|Filter by|Sort by|Clear|Reset|Submit|Edit|Update|Refresh|Unique|Cards Owned|My Collection|Wishlist|Trade ?List|Sign In|Sign Up|Log ?out|Compare|No data|not found|Coverage|Overview|Details|Download|Upload|Open|Hide|View|Total|Players|Rank|Price|Last updated|Generated|Tournaments?|Recent|Popular|Trending)\b/;
  const PLATZ = /\{[A-Z_]{3,}\}|\bundefined\b|\bNaN\b|BITTE_EINTRAGEN|\[object Object\]/;
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));

  async function ansicht(tab, unter) {
    // Nur wechseln, wenn die Ansicht nicht schon offen ist — ein Wechsel
    // verwirft z. B. ?deck= in der Adresse (UI-99).
    const offen = location.hash.replace(/^#/, '').split('?')[0] === tab;
    if (!offen && typeof switchTabAndUpdateMenu === 'function') { switchTabAndUpdateMenu(tab); await warte(2500); }
    if (unter && typeof switchProfileTab === 'function') { switchProfileTab(unter); await warte(2000); }
    const wurzel = unter ? document.getElementById('profile-' + unter) || document.getElementById(tab) : document.getElementById(tab);
    if (!wurzel) return { ansicht: tab + (unter ? '/' + unter : ''), fehler: 'kein Element' };
    const kn = [...wurzel.querySelectorAll(KNOPF)].filter(sichtbar)
      .filter((e) => !e.closest('select') || e.tagName === 'SELECT');
    const nurTitel = kn.filter((e) => !text(e) && e.title && !e.getAttribute('aria-label'));
    const unbeschr = kn.filter((e) => !text(e) && !e.title && !e.getAttribute('aria-label') && !(e.labels && e.labels.length));
    const klein = kn.filter((e) => { const r = e.getBoundingClientRect(); return (r.width < 44 || r.height < 44) && !['checkbox', 'radio'].includes(e.type); });
    const blaetter = [...wurzel.querySelectorAll('*')].filter((e) => e.children.length === 0 && text(e) && sichtbar(e));
    const engl = [...new Set(blaetter.map(text).filter((t) => t.length < 80 && EN.test(t)))];
    const platz = [...new Set(blaetter.map(text).filter((t) => PLATZ.test(t)))];
    const proz = blaetter.map(text).filter((t) => /\d[\d.,]*\s?%/.test(t)).length;
    const groessen = new Set(), farben = new Set();
    blaetter.slice(0, 4000).forEach((e) => { const s = getComputedStyle(e); groessen.add(s.fontSize); farben.add(s.color); });
    const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
    return {
      ansicht: tab + (unter ? '/' + unter : ''),
      titel: document.title,
      adresse: location.hash,
      hoehe: Math.round(wurzel.getBoundingClientRect().height),
      knoepfe: kn.length,
      nurTitel: nurTitel.length,
      nurTitelBeispiele: nurTitel.slice(0, 6).map((e) => e.title.slice(0, 40)),
      unbeschriftet: unbeschr.length,
      klein44: klein.length,
      englisch: engl.length,
      englischBeispiele: engl.slice(0, 12),
      platzhalter: platz.slice(0, 6),
      prozente: proz,
      schriftgroessen: groessen.size,
      farben: farben.size,
      querueberlauf: sw > cw,
      knopfTexte: kn.slice(0, 80).map((e) => (text(e) || e.getAttribute('aria-label') || e.title || e.tagName).slice(0, 36)),
    };
  }

  const HAUPT = ['current-meta', 'current-analysis', 'meta-call', 'past-meta', 'city-league', 'city-league-analysis', 'cards', 'proxy', 'calculator', 'side-quest', 'pocket', 'tutorial', 'quellen'];
  const PROFIL = ['collection', 'wishlist', 'tradelist', 'metabinder', 'custombinder', 'archetypbox', 'decks', 'deckcompare', 'deckbuilder', 'journal', 'testinggroups', 'masterclass', 'settings'];

  async function alle() {
    const aus = [];
    for (const t of HAUPT) aus.push(await ansicht(t));
    for (const p of PROFIL) aus.push(await ansicht('profile', p));
    return aus;
  }

  function ladeMB() {
    const e = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/'));
    const mb = e.reduce((s, r) => s + (r.decodedBodySize || 0), 0) / 1048576;
    const zahl = {};
    e.forEach((r) => { const n = r.name.split('/data/')[1].split('?')[0]; zahl[n] = (zahl[n] || 0) + 1; });
    return { dateien: Object.keys(zahl).length, abrufe: e.length, mb: Math.round(mb * 10) / 10, mehrfach: Object.entries(zahl).filter(([, n]) => n > 1) };
  }

  async function nutzerdaten() {
    const u = firebase.auth().currentUser; if (!u) return 'nicht angemeldet';
    const ref = firebase.firestore().collection('users').doc(u.uid);
    const out = {};
    for (const s of ['decks', 'journal', 'archetypBoxen', 'customBinders', 'deckTombstones']) {
      const q = await ref.collection(s).get({ source: 'server' });
      out[s] = q.size + '/' + q.docs.filter((d) => JSON.stringify(d.data()).includes('ZZ-TEST')).length;
    }
    const d = (await ref.get({ source: 'server' })).data() || {};
    out.wishlist = (d.wishlist || []).length; out.metaBinderCards = (d.metaBinderCards || []).length;
    out.deckFolders = (d.deckFolders || []).length; out.priceAlerts = Object.keys(d.priceAlerts || {}).length;
    out.championsShiny = (d.championsShiny || []).length; out.collection = (d.collection || []).length;
    out.localZZ = Object.keys(localStorage).filter((k) => (localStorage.getItem(k) || '').includes('ZZ-TEST')).length;
    return out;
  }

  window.__inventur = { ansicht, alle, ladeMB, nutzerdaten, HAUPT, PROFIL };
  return 'bereit';
})();
