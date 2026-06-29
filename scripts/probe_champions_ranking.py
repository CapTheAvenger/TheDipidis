#!/usr/bin/env python3
"""PROBE: bisafans faehigkeitendex effect text for Emporwindung (Eelevate) + Flammenmaehne (Fire Mane)."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"de-DE,de;q=0.9"}
def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
def clean(h):
    h=re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<head.*?</head>","",h)
    h=re.sub(r"(?is)<(p|br|tr|li|div|h[1-6]|td)\b[^>]*>","\n",h)
    h=re.sub(r"<[^>]+>"," ",h)
    h=h.replace("&nbsp;"," ").replace("&amp;","&").replace("&#160;"," ").replace("&shy;","")
    h=re.sub(r"[ \t]+"," ",h)
    return [l.strip() for l in h.splitlines() if l.strip()]
for name,u in (("EMPORWINDUNG / Eelevate","https://www.bisafans.de/faehigkeitendex/emporwindung.php"),
               ("FLAMMENMAEHNE / Fire Mane","https://www.bisafans.de/faehigkeitendex/flammenmaehne.php")):
    print("========",name,"========")
    try:
        for l in clean(fetch(u)):
            low=l.lower()
            if any(k in low for k in ("erhöht","erhoeht","stärke","staerke","attack","feuer","schaden","prozent","%","bewirk","fähigkeit","effekt","wenn","wird","steig","senk","boden","schwebe","sofort","wechs")) and 8<len(l)<400:
                print(l)
    except Exception as e:
        print("ERR",e)
print("done")
