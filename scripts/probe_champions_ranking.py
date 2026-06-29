#!/usr/bin/env python3
"""PROBE: pull the Champions new-mega abilities from bisafans + the
Flammenmähne page from PokeWiki, so we can fill champions_ability_overrides.
Strips tags and prints readable text. Run from CI (these 403 locally)."""
import re, urllib.request, urllib.error
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Accept-Language":"de-DE,de;q=0.9"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
def text(html):
    html=re.sub(r"(?is)<script.*?</script>|<style.*?</style>","",html)
    html=re.sub(r"(?i)</(tr|p|div|li|h\d|td|th)>","\n",html)
    html=re.sub(r"(?i)</td>|<td[^>]*>"," | ",html)
    html=re.sub(r"<[^>]+>"," ",html)
    html=re.sub(r"&nbsp;"," ",html); html=re.sub(r"&amp;","&",html)
    html=re.sub(r"[ \t]+"," ",html)
    return "\n".join(l.strip() for l in html.splitlines() if l.strip())
for label,url in [
    ("BISAFANS", "https://www.bisafans.de/spiele/spin-offs/champions/neue-faehigkeiten-mega-pokemon.php"),
    ("POKEWIKI-FLAMMENMAEHNE", "https://www.pokewiki.de/Flammenm%C3%A4hne"),
]:
    print(f"\n########## {label} : {url} ##########")
    try:
        t=text(get(url))
    except urllib.error.HTTPError as e: print("HTTP",e.code); continue
    except Exception as e: print("ERR",e); continue
    # print lines mentioning abilities/keywords, with context
    keys=("Mähne","Flamme","Eelevate","Eelektross","Pyroar","Glurak","Surge","Fähigkeit","Mega","erzeug","Runde","Sonnen","Terrain","Feld","Schwebe")
    for i,l in enumerate(t.splitlines()):
        if any(k.lower() in l.lower() for k in keys) and 4 < len(l) < 400:
            print(l)
print("\ndone")
