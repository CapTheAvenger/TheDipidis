#!/usr/bin/env python3
"""PROBE (temporary): can we fetch ONE PDF card list on a fresh runner?

Previous run discovered the 6 PDF URLs but got 403 when downloading them — right
after 20 page fetches, so likely rate-limiting (not real protection). Isolate it:
a couple of requests only, fresh runner, try with and without a play.pokemon
Referer. If 200 -> build a gentle PDF-based builder; if 403 alone -> PDFs are
protected and we fall back to highlights + enumeration.
"""
import io
import subprocess
import sys
import urllib.error
import urllib.request

PDF_DE = ("https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/"
          "P12252_OP_Prize_Packs_Series9_Card_List_DE.pdf")
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}


def out(m):
    print(m, flush=True)


def fetch(url, headers):
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:80].encode()


def main():
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pypdf"], check=False)
    import pypdf  # noqa: PLC0415

    variants = {
        "no headers": {},
        "browser UA only": dict(UA),
        "browser UA + play referer": dict(UA, **{"Referer": "https://play.pokemon.com/"}),
    }
    good = None
    for label, hdrs in variants.items():
        st, body = fetch(PDF_DE, hdrs)
        is_pdf = body[:5] == b"%PDF-"
        out(f"[{label}] -> {st} bytes={len(body)} pdf={is_pdf}")
        if is_pdf and good is None:
            good = body

    if not good:
        out("\nNo variant returned a PDF. PDFs appear protected/rate-limited.")
        return 0

    out("\n== extract text of the working PDF ==")
    reader = pypdf.PdfReader(io.BytesIO(good))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    out(f"pages={len(reader.pages)} non-empty-lines={len(lines)}; first 80:")
    for ln in lines[:80]:
        out("  | " + ln[:160])
    return 0


if __name__ == "__main__":
    sys.exit(main())
