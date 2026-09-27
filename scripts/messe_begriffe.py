#!/usr/bin/env python3
"""Welche Woerter stehen wirklich auf den Meta-Ansichten? — gemessen am gezeichneten Schirm.

UI-18 (Rutsch 6, 27.09.2026, Hausi): „Wording ueberall konsequent ‚Matches'
statt ‚Partien'/‚Games'". Ein Grep im Quelltext sieht Kommentare,
Bezeichner und Regex-Muster und uebersieht zusammengesetzte Texte. Dieses
Werkzeug laedt die Seite, oeffnet jede Meta-Ansicht, klappt alle
<details> auf und zaehlt die Treffer im SICHTBAREN Text und in den
Hinweisen (title, aria-label, data-hinweis) — also genau das, was ein
Leser zu sehen bekommt.

AUFRUF
------
    python3 -m http.server 8765 --bind 127.0.0.1 &      # aus der Repo-Wurzel
    python3 scripts/messe_begriffe.py                    # Standard: Partie|Games
    python3 scripts/messe_begriffe.py --muster "Siegquote" --sprache de
    python3 scripts/messe_begriffe.py --url https://thedipidis.app/

Ausgabe: je Ansicht und Sprache eine Zeile mit der Trefferzahl, darunter
bis zu fuenf Fundstellen. Rueckgabe 0 — das Werkzeug misst, es urteilt nicht.

Das Battle Journal ist absichtlich NICHT dabei: dort ist ein Game eine
Einzelpartie innerhalb eines Bo3-Matches (Entscheidung Hausi, 27.09.2026).
"""
import argparse
import asyncio
import re

ANSICHTEN = ["current-meta", "current-analysis", "past-meta", "meta-call",
             "city-league", "city-league-analysis"]

SAMMLER = r"""
(args) => {
  const [ansicht, muster] = args;
  const wurzel = document.getElementById(ansicht);
  if (!wurzel) return {fehlt: true};
  wurzel.querySelectorAll('details').forEach(d => { d.open = true; });
  const re = new RegExp(muster, 'g');
  const funde = [];
  const txt = wurzel.innerText || '';
  let m;
  while ((m = re.exec(txt))) funde.push('text: …' + txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ') + '…');
  wurzel.querySelectorAll('[title],[aria-label],[data-hinweis]').forEach(e => {
    ['title', 'aria-label', 'data-hinweis'].forEach(a => {
      const v = e.getAttribute(a);
      if (!v) return;
      const r2 = new RegExp(muster, 'g');
      let mm;
      while ((mm = r2.exec(v))) funde.push(a + ': …' + v.slice(Math.max(0, mm.index - 40), mm.index + 40) + '…');
    });
  });
  return {funde};
}
"""


async def miss(url, muster, sprachen):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for sprache in sprachen:
            pg = await b.new_page(viewport={'width': 1280, 'height': 900},
                                  locale='de-DE' if sprache == 'de' else 'en-US')
            await pg.goto(url, wait_until='load', timeout=90000)
            await pg.wait_for_function('typeof window.switchTab === "function"', timeout=90000)
            for ans in ANSICHTEN:
                await pg.evaluate(f"switchTab('{ans}')")
                await pg.wait_for_timeout(7000)
                erg = await pg.evaluate(SAMMLER, [ans, muster])
                if erg.get('fehlt'):
                    print(f"{sprache} {ans:22s} Ansicht fehlt")
                    continue
                funde = erg['funde']
                print(f"{sprache} {ans:22s} {len(funde)} Treffer")
                for f in funde[:5]:
                    print('      ' + f)
            await pg.close()
        await b.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:8765/index.html')
    ap.add_argument('--muster', default=r'Partie|\b[Gg]ames?\b')
    ap.add_argument('--sprache', choices=['de', 'en', 'beide'], default='beide')
    a = ap.parse_args()
    re.compile(a.muster)
    sprachen = ['de', 'en'] if a.sprache == 'beide' else [a.sprache]
    asyncio.run(miss(a.url, a.muster, sprachen))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
