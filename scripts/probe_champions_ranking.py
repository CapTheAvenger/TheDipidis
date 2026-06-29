#!/usr/bin/env python3
"""PROBE: full bisafans Champions mega-ability table text."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"de-DE,de;q=0.9"}
html=urllib.request.urlopen(urllib.request.Request("https://www.bisafans.de/spiele/spin-offs/champions/neue-faehigkeiten-mega-pokemon.php",headers=UA),timeout=45).read().decode("utf-8","replace")
html=re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<head.*?</head>","",html)
# Keep table structure: rows separated by </tr>, cells by ' || '
html=re.sub(r"(?i)</tr>","\n",html)
html=re.sub(r"(?i)</t[dh]>"," || ",html)
html=re.sub(r"<[^>]+>"," ",html)
html=html.replace("&nbsp;"," ").replace("&amp;","&").replace("&#160;"," ")
html=re.sub(r"[ \t]+"," ",html)
for l in html.splitlines():
    l=l.strip()
    # table rows have the ' || ' cell separator; print those + any Mega line
    if (" || " in l or "Mega" in l) and 6 < len(l) < 500:
        print(l)
print("done")
