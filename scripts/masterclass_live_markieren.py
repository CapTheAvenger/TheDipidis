#!/usr/bin/env python3
"""Markiert in einer Masterclass-Ausarbeitung die Stellen, die beim Oeffnen
aus data/masterclass_live/<id>.json frisch eingesetzt werden.

EINMALIG BEIM UMZUG INS KONTO (17.10.2026) — und fuer jede kuenftige
Masterclass, die Zahlen aus den Turnierdaten traegt. Das Skript liest die
Ausarbeitung von der Platte (sie liegt NICHT im Repo) und schreibt eine
markierte Fassung, die per Chrome ins Konto geladen wird:

    python3 scripts/masterclass_live_markieren.py <ein.html> <aus.html> [--stand JJJJ-MM-TT]

Was markiert wird (js/ds-masterclass.js, liveEinsetzen):
  * details.mcl-mu  -> data-live-slug="<archetyp>" (Name -> Schluessel wie
                       im Erzeuger, _slugs); ohne Schluessel bleibt der Block
                       unmarkiert und unveraendert — wie vorher im Erzeuger.
  * .mcl-wrz-Zellen der drei gemessenen Spalten -> data-live-spalte=
                       jetzt|davor|majors (Tims Spalte bleibt unmarkiert).
  * die Spaltennamen in Legende und Quellenzeile, der Majors-Satz, die
    Turniernummern, Dateinamen und Stand -> data-live="<schluessel>".
  * ein unsichtbares <div data-live-stand="…"> fuer den Rueckfallhinweis.
Es veraendert keinen Satz der Ausarbeitung — ausser der Zeile „Die Zahlen
sind der Stand des Baus — das Stück zieht nicht selbst nach“, die ab jetzt
falsch waere.
"""
import argparse
import datetime as dt
import html
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import masterclass_zahlen_nachziehen as Z  # noqa: E402

LEGENDE = re.compile(r"<b>([^<]+)</b>( ist das laufende Online-Format, )<b>([^<]+)</b>"
                     r"( das Online-Format davor,\s*)<b>(Majors \([^)<]+\))</b> "
                     r"(sind die letzten (?:Präsenzturniere|Majors)[^.]*?\.(?:[^.<]*?gab es noch nicht\.)?)")
ALT_SATZ = re.compile(r"<b>Die Zahlen sind der Stand des Baus</b> — das Stück\s*zieht nicht selbst nach\.")


def markieren(roh, slugs, stand):
    zaehl = {"bloecke": 0, "ohne_slug": [], "zellen": 0, "stellen": 0}
    m = LEGENDE.search(roh)
    if not m:
        raise SystemExit("::error::Legende der Spalten nicht gefunden — nichts geschrieben")
    jetzt, davor, majors = m.group(1), m.group(3), m.group(5)
    spalte_von = {jetzt: "jetzt", davor: "davor", majors: "majors"}
    roh = roh[:m.start()] + (
        '<b data-live="kopf-jetzt">%s</b>%s<b data-live="kopf-davor">%s</b>%s'
        '<b data-live="kopf-majors">%s</b> <span data-live="majors-satz">%s</span>'
        % (jetzt, m.group(2), davor, m.group(4), majors, m.group(6))) + roh[m.end():]
    zaehl["stellen"] += 4

    def block(mb):
        en = html.unescape(mb.group(1)).strip().lower()
        b = mb.group(0)
        slug = slugs.get(en)
        if not slug:
            zaehl["ohne_slug"].append(mb.group(1))
            return b

        def zelle(mz):
            kopf = mz.group(3)
            sp = spalte_von.get(kopf)
            if not sp:
                return mz.group(0)
            zaehl["zellen"] += 1
            # hinten an den oeffnenden Tag: die Inhaltspruefungen lesen
            # `<span class="mcl-wrz… title="…">` in dieser Reihenfolge.
            kopf_tag = mz.group(0).index(">")
            return mz.group(0)[:kopf_tag] + ' data-live-spalte="%s"' % sp + mz.group(0)[kopf_tag:]
        zaehl["bloecke"] += 1
        return Z.ZELLE.sub(zelle, b)

    roh = Z.BLOCK.sub(block, roh)
    # data-live-slug an das zugehoerige <details>: den Block davor suchen
    teile = roh.split('<details class="mcl-mu"')
    for i in range(1, len(teile)):
        nm = re.search(r'<span class="mcl-nm">[^<]*<em>([^<]*)</em></span>', teile[i])
        slug = slugs.get(html.unescape(nm.group(1)).strip().lower()) if nm else None
        if slug:
            teile[i] = ' data-live-slug="%s"' % html.escape(slug) + teile[i]
    roh = '<details class="mcl-mu"'.join(teile)

    def quelle(mq, schluessel_kopf, schluessel_datei, schluessel_stand):
        zaehl["stellen"] += 3
        return ('<span data-live="%s">%s</span> (online): <code data-live="%s">%s</code>, Stand '
                '<span data-live="%s">%s</span>' % (schluessel_kopf, mq.group(1), schluessel_datei,
                                                     mq.group(2), schluessel_stand, mq.group(3)))
    for kopf, sk in ((jetzt, "jetzt"), (davor, "davor")):
        roh, n = re.subn(r"(%s) \(online\): <code>(data/online_api_matchups_[^<]+\.csv)</code>, Stand (\d{4}-\d\d-\d\d)"
                         % re.escape(kopf),
                         lambda mq, sk=sk: quelle(mq, "kopf-" + sk, "datei-online-" + sk, "stand-online-" + sk),
                         roh, count=1)
        if not n:
            raise SystemExit("::error::Quellenzeile fuer %s nicht gefunden" % kopf)
    roh, n = re.subn(r"(%s): (<code>data/labs_tournament_matchups\.csv</code>), Turniere ([\d ,und]+?)(,\s)"
                     % re.escape(majors),
                     lambda mq: '<span data-live="kopf-majors">%s</span>: %s, Turniere <span data-live="majors-turniere">%s</span>%s'
                     % (mq.group(1), mq.group(2), mq.group(3), mq.group(4)), roh, count=1)
    if not n:
        raise SystemExit("::error::Quellenzeile der Majors nicht gefunden")
    zaehl["stellen"] += 2
    roh, n = ALT_SATZ.subn('<b>Die Zahlen kommen beim Öffnen frisch</b> aus '
                           '<code>data/masterclass_live/mega-stalobor.json</code> (Wochenlauf).', roh)
    zaehl["alter_satz"] = n
    roh = roh.replace('<div class="mcl-kopf">',
                      '<div class="mcl-live-stand" data-live-stand="%s" hidden></div>\n<div class="mcl-kopf">'
                      % stand, 1)
    return roh, zaehl


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ein")
    ap.add_argument("aus")
    ap.add_argument("--stand", default=dt.date.today().strftime("%d.%m.%Y"))
    a = ap.parse_args()
    with open(a.ein, encoding="utf-8") as f:
        roh = f.read()
    neu, z = markieren(roh, Z._slugs(), a.stand)
    with open(a.aus, "w", encoding="utf-8") as f:
        f.write(neu)
    print("markiert: %d Matchup-Bloecke, %d Zellen, %d Stellen; ohne Schluessel: %s; alter Satz ersetzt: %d"
          % (z["bloecke"], z["zellen"], z["stellen"], ", ".join(z["ohne_slug"]) or "—", z["alter_satz"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
