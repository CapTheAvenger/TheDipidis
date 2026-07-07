#!/usr/bin/env python3
"""PROBE: run the JS-tournament discovery against live Limitless and print the
IDs for the current window (jp_release_date .. today). Mirrors
update_sets.discover_js_tournament_ids so we validate the regex/date parsing
and capture the exact seed list — no guessing."""
import re, json, os, datetime, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "en"}
URL = "https://limitlesstcg.com/tournaments?format=standard-jp&show=100&page={page}"


def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode("utf-8", "replace")


def parse_date(t):
    t = (t or "").strip()
    for fmt in ("%d %b %y", "%d %b %Y"):
        try:
            return datetime.datetime.strptime(t, fmt).date()
        except ValueError:
            pass
    return None


def discover(start, end):
    found = {}  # id -> (date, name)
    for page in range(1, 11):
        html = fetch(URL.format(page=page))
        rows_seen = 0
        oldest = None
        for row in re.split(r"(?i)<tr\b", html):
            if "/tournaments/" not in row:
                continue
            dm = re.search(r"<td[^>]*>\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\s*</td>", row)
            im = re.search(r'/tournaments/(\d+)"', row)
            if not dm or not im:
                continue
            d = parse_date(dm.group(1))
            if not d:
                continue
            rows_seen += 1
            oldest = d if oldest is None or d < oldest else oldest
            nm = re.search(r'/tournaments/\d+"[^>]*>([^<]+)</a>', row)
            if start <= d <= end:
                found[int(im.group(1))] = (d.isoformat(), (nm.group(1).strip() if nm else "?"))
        print(f"  page {page}: rows={rows_seen} oldest={oldest}")
        if rows_seen == 0:
            break
        if oldest is not None and oldest < start:
            break
    return found


fw = json.load(open("data/format_window.json"))
jp = fw.get("jp_release_date")
today = datetime.date.today()
print(f"jp_release_date={jp}  today={today.isoformat()}")
res = discover(datetime.date.fromisoformat(jp), today)
print("\n== JS tournaments in current window ==")
for tid in sorted(res):
    print(f"  {tid}  {res[tid][0]}  {res[tid][1]}")
print("\nSEED_IDS =", sorted(res))
