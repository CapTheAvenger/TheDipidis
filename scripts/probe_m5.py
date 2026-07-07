#!/usr/bin/env python3
"""PROBE: resolve Gwynn's M5 number. Fetch trainer pages #73-79, dump any
English text / alt / links so we can identify which one is 'Gwynn'. Also try
the Limitless English-card route (some JP cards link to an EN print name)."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def fetch(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"

for n in range(73,80):
    p=fetch(f"https://limitlesstcg.com/cards/jp/M5/{n}")
    print(f"\n==== M5/{n} ====")
    if p.startswith('__ERR__'):
        print(p); continue
    # Card type/name area: strip tags, keep a middle slice with the card text.
    body=re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<svg.*?</svg>","",p)
    # any English-looking tokens (helps spot 'Gwynn')
    txt=re.sub(r"<[^>]+>"," ",body)
    txt=re.sub(r"&[a-z]+;"," ",txt)
    eng=re.findall(r"[A-Za-z][A-Za-z'./-]{3,}", txt)
    # drop boilerplate words
    stop=set("Limitless Cards Decks Tournaments Tools Login More Search cards Japanese English Abyss Eye Standard Expanded price prices Cardmarket TCGplayer Related Report Toggle Darkmode https limitlesstcg com www png jpg http image Trainer Supporter Item Stadium Energy Pokemon Pokémon".split())
    keep=[w for w in eng if w not in stop]
    # show the card's own title + filtered english tokens
    t=re.search(r"<title>(.*?)</title>",p,re.S)
    print("  title:", re.sub(r"\s+"," ",re.sub(r"<[^>]+>","",t.group(1))).strip() if t else "-")
    # dedupe preserve order
    seen=set(); uniq=[w for w in keep if not (w in seen or seen.add(w))]
    print("  english tokens:", " ".join(uniq[:40]))
    # explicit gwynn check
    if re.search(r"gwynn", p, re.I):
        print("  >>> CONTAINS 'Gwynn'")
