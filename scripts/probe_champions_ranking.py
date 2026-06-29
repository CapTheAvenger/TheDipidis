#!/usr/bin/env python3
"""PROBE: raw bisafans Champions mega-ability HTML window around Pyroleo / Zapplarang."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"de-DE,de;q=0.9"}
html=urllib.request.urlopen(urllib.request.Request("https://www.bisafans.de/spiele/spin-offs/champions/neue-faehigkeiten-mega-pokemon.php",headers=UA),timeout=45).read().decode("utf-8","replace")
html=re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<head.*?</head>","",html)
for needle in ("Pyroleo","Zapplarang","Cerapendra"):
    i=html.find(needle)
    print("==== ",needle," @",i," ====")
    if i<0: continue
    print(html[max(0,i-200):i+1400])
    print("---- end ----")
print("done")
