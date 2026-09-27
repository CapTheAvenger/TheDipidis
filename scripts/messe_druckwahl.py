#!/usr/bin/env python3
"""Welcher Druck steht in der Kartenuebersicht — und waere ein anderer richtig?

FE-8 (Backlog 27.09.2026, Entscheidung Hausi): in der Kartenuebersicht steht
jede Karte im AKTUELLSTEN LOW-RARITY-DRUCK: unter allen Drucken derselben
Karte (verbunden ueber set/number — getInternationalPrintsForCard, nie ueber
den Namen) die niedrigste Seltenheit, bei Gleichstand das neueste Set.

Das Werkzeug liest jede Kachel der Uebersicht (data-card-set/-number), holt
den Druckvorrat dieser Karte und meldet jede Kachel, fuer die ein Druck mit
NIEDRIGERER Seltenheit oder GLEICHER Seltenheit aus einem NEUEREN Set
existiert. Die Seltenheitsstufe ist bewusst eine eigene, einfache Leiter
(nicht getRarityPriority der Seite) — sonst pruefte die Seite sich selbst.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_druckwahl.py --ansicht past-meta
    python3 scripts/messe_druckwahl.py --ansicht current-analysis --breite 1280
"""
import argparse
import sys

GITTER = {"past-meta": "pastMetaDeckGrid", "current-analysis": "currentMetaDeckGrid",
          "city-league": "cityLeagueDeckGrid"}
AUSWAHL = {"past-meta": "pastMetaDeckSelect", "current-analysis": "currentMetaDeckSelect",
           "city-league": "cityLeagueDeckSelect"}

QUELLE = {"past-meta": "pastMeta", "current-analysis": "currentMeta", "city-league": "cityLeague"}

MESSUNG = r"""
([gitterId, quelle]) => {
  const stufe = (r) => {
    r = String(r || '').toLowerCase();
    if (!r) return 50;
    if (r === 'common') return 1;
    if (r === 'uncommon') return 2;
    if (r === 'rare') return 3;
    if (r.includes('ace spec')) return 4;
    if (r === 'rare holo' || r === 'holo rare') return 4;
    if (r.includes('double rare')) return 5;
    if (r.includes('promo')) return 8;
    return 10;   // alles Hoehere (Ultra, Illustration, Hyper, ...)
  };
  const neu = (s) => (window.setOrderMap || {})[s] || 0;
  const out = [];
  // Kacheln der Uebersicht ODER (quelle gesetzt) die Karten des gebauten Decks
  const eintraege = quelle
    ? Object.keys(window[quelle + 'Deck'] || {}).map(k => { const m = k.match(/^(.*) \(([A-Z0-9]+) ([A-Z0-9-]+)\)$/);
        return m ? {name: m[1], set: m[2], nr: m[3]} : {name: k, set: '', nr: ''}; })
    : [...document.querySelectorAll('#' + gitterId + ' .card-item')].map(k => ({
        name: k.dataset.cardName, set: String(k.dataset.cardSet || '').toUpperCase(),
        nr: String(k.dataset.cardNumber || '').toUpperCase()}));
  eintraege.forEach((k) => {
    const set = k.set, nr = k.nr;
    if (!set || !nr) { out.push({name: k.name, fehler: 'ohne set/nummer'}); return; }
    const vorrat = (typeof getInternationalPrintsForCard === 'function')
      ? getInternationalPrintsForCard(set, nr) : [];
    const eigen = vorrat.find(v => String(v.set).toUpperCase() === set && String(v.number).toUpperCase() === nr);
    const sE = eigen ? stufe(eigen.rarity) : 50;
    const besser = vorrat.filter(v => {
      const s = stufe(v.rarity);
      if (s >= 50) return false;
      return s < sE || (s === sE && neu(v.set) > neu(set));
    });
    // Basis-Energien stehen per Regel auf SVE (getPreferredVersionForCard,
    // "SPECIAL HANDLING: Basic Energies") — das ist Absicht, kein Befund.
    const basisEnergie = set === 'SVE' && /^(grass|fire|water|lightning|psychic|fighting|darkness|metal) energy$/i.test(k.name);
    out.push({name: k.name, druck: set + ' ' + nr, seltenheit: eigen ? eigen.rarity : '?',
              vorrat: vorrat.length,
              besser: basisEnergie ? [] : besser.map(v => v.set + ' ' + v.number + ' (' + (v.rarity || '-') + ')')});
  });
  return out;
}
"""


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--ansicht", default="past-meta", choices=sorted(GITTER))
    ap.add_argument("--breite", type=int, default=1280)
    ap.add_argument("--deck", default="", help="Archetyp; leer = erster in der Auswahl")
    ap.add_argument("--gebaut", action="store_true", help="statt der Uebersicht das per Generate (min) gebaute Deck messen")
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch()
        s = b.new_page(viewport={"width": a.breite, "height": 900})
        s.add_init_script("try { localStorage.setItem('app_lang', 'de'); } catch (e) {}")
        s.goto(a.url, wait_until="load", timeout=60000)
        s.wait_for_timeout(3000)
        for _ in range(4):
            try:
                s.evaluate("a => window.switchTab && window.switchTab(a)", a.ansicht)
            except Exception:
                s.wait_for_timeout(3000)
                continue
            s.wait_for_timeout(7000)
            if s.evaluate("a => getComputedStyle(document.getElementById(a)).display !== 'none'", a.ansicht):
                break
        gewaehlt = s.evaluate("""([id, deck]) => { const sel = document.getElementById(id); if (!sel) return null;
            const o = [...sel.options].find(o => deck ? o.value === deck : (o.value && !/alle|all/i.test(o.textContent)));
            if (!o) return null; sel.value = o.value; sel.dispatchEvent(new Event('change', {bubbles: true})); return o.value; }""",
                              [AUSWAHL[a.ansicht], a.deck])
        s.wait_for_timeout(12000)
        if a.gebaut:
            s.evaluate("q => { try { autoCompleteConsistency(q, 'min'); } catch (e) {} }", QUELLE[a.ansicht])
            s.wait_for_timeout(15000)
        erg = s.evaluate(MESSUNG, [GITTER[a.ansicht], QUELLE[a.ansicht] if a.gebaut else ""])
        b.close()
    falsch = [k for k in erg if k.get("besser")]
    for k in erg:
        if k.get("besser") or k.get("fehler"):
            print("%-28s %-10s %-22s -> %s" % (k.get("name", "")[:28], k.get("druck", ""),
                                             k.get("seltenheit", k.get("fehler", "")), ", ".join(k.get("besser", []))[:120]))
    print("%s%s · %s: %d Kacheln, %d mit besserem Druck im Vorrat" % (a.ansicht, " (gebautes Deck)" if a.gebaut else "", gewaehlt, len(erg), len(falsch)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
