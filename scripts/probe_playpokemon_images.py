#!/usr/bin/env python3
"""PROBE (temporary): discover the per-series PDF card lists + dump their text.

The gallery's __NEXT_DATA__ only has curated highlights; the full card list per
series lives in an official PDF (linked via cardList CTA), e.g.
  .../series9/de-de/P12252_OP_Prize_Packs_Series9_Card_List_DE.pdf
The P-number prefix is unpredictable, so we SCRAPE each series gallery page for
the .pdf href instead of guessing. Then we extract the PDF text (pypdf) and print
the first lines so we can write a correct (number -> name) parser.
"""
import json
import re
import subprocess
import sys
import urllib.request

PLAY = "https://play.pokemon.com"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}


def out(m):
    print(m, flush=True)


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def find_pdf_hrefs(html):
    return sorted(set(re.findall(r'https://[^\s"\']+?\.pdf', html)))


def main():
    # 1) which series does the gallery expose, and what PDF does each link?
    out("== discover PDF card-list URLs per series (de-de & en-us) ==")
    pdfs = {}
    for loc in ("de-de", "en-us"):
        for s in range(1, 11):
            url = f"{PLAY}/{loc}/rewards/gallery/?filter=series{s}"
            try:
                html = get(url).decode("utf-8", "replace")
            except Exception as e:  # noqa: BLE001
                out(f"  {loc} series{s}: fetch error {type(e).__name__}")
                continue
            hrefs = [h for h in find_pdf_hrefs(html) if f"eries{s}" in h.lower()
                     or f"series{s}" in h.lower()]
            # keep only ones under this series path
            hrefs = [h for h in hrefs if f"/series{s}/" in h]
            if hrefs:
                pdfs[(loc, s)] = hrefs[0]
                out(f"  {loc} series{s}: {hrefs[0]}")
    out(f"\nfound {len(pdfs)} PDF links")

    # 2) install pypdf and dump text of a couple PDFs to learn the format
    out("\n== pip install pypdf ==")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pypdf"], check=False)
    import pypdf  # noqa: PLC0415

    import io
    for key in [("de-de", 9), ("en-us", 9), ("de-de", 7)]:
        url = pdfs.get(key)
        out(f"\n===== PDF {key} =====\n{url}")
        if not url:
            out("  (no url discovered)")
            continue
        try:
            data = get(url)
            reader = pypdf.PdfReader(io.BytesIO(data))
            out(f"  pages={len(reader.pages)} bytes={len(data)}")
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
            lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
            out(f"  non-empty lines={len(lines)}; first 60:")
            for ln in lines[:60]:
                out("   | " + ln[:160])
        except Exception as e:  # noqa: BLE001
            out(f"  parse error {type(e).__name__}: {str(e)[:120]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
