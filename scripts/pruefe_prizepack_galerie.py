#!/usr/bin/env python3
"""Haelt jede Prize-Pack-Kachel GEGEN DAS BILD, das sie zeigt.

BEFUND (Betreiber, 25.09.2026, Bildschirmfoto)
----------------------------------------------
Im Rarity Switcher von **Metang** stand als dritte Wahl

    „Prize-Pack-Print (gestempelt) · Prize-Pack-Serie 7 · TEF 114“

und darunter das Artwork von **Benesaru (Munkidori)**. Die Zuordnung
Druck -> Galeriebild ist also mindestens an einer Stelle falsch.

URSACHE
-------
`build_prizepack_official_images.py` leitet die Bildnummer aus der
ZEILENNUMMER der offiziellen PDF-Kartenliste ab („die PDF-Zeile ist die
Galerienummer“). Geprueft war das an EINER Karte (SE9, Zeile 19 =
Mega-Dragoran-ex). Ueberpruefbar war es nie: eine Liste ohne Luecke sieht
richtig aus, auch wenn sie um eins verschoben ist — und die Nummer wird
zur Bildadresse. Gegengeprueft ist immerhin die Vollstaendigkeit: die 96
Karten der Serie 7 stehen auch bei Cardmarket (PPS7), keine fehlt, keine
ist doppelt. Verschoben sein kann die Zuordnung trotzdem.

WAS HIER GEMESSEN WIRD
----------------------
Zwei unabhaengige Bilder derselben Karte:

    A  das gestempelte Galeriebild (CloudFront, Nummer aus unseren Daten)
    B  der Basisdruck aus der eigenen Kartendatenbank (Limitless-CDN,
       gefunden ueber (set, number) — nie ueber den Namen, CLAUDE.md)

Beide werden auf ein graues 32x32-Raster gebracht und ueber die mittlere
absolute Abweichung verglichen. Entscheidend ist NICHT der Abstand,
sondern der RANG: gehoert A zu der Karte, die unsere Daten behaupten,
muss B unter allen Galeriebildern derselben Serie das naechste sein — und
zwar deutlich. Sonst steht da NICHT GEPRUEFT, nicht „OK“.

Das Urteil wird in data/prizepack_official_images.json geschrieben
(`geprueft`, `pruefung`, `pruefstand`). Die Oberflaeche zeigt ein
gestempeltes Bild nur bei `geprueft: true` — js/app-core.js.
Nichts wird stillschweigend berichtigt: eine falsche Nummer wird
GEMELDET, nicht geraten.

OHNE FREMDE BIBLIOTHEK
----------------------
PNG wird hier selbst gelesen (zlib + Entfilterung, beide Quellen liefern
PNG). Der Ablauf, der dieses Skript startet, installiert nur `pypdf` —
und seine Datei ist aus dieser Sitzung nicht aenderbar. Eine Pruefung,
die eine Bibliothek braucht, die dort fehlt, laeuft nie.
"""
import argparse
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}

RASTER = 32
# Der beste Abstand muss um diesen Faktor besser sein als der
# zweitbeste. Keine Naturkonstante, eine Vorsichtsmarke — darunter heisst
# es NICHT GEPRUEFT.
VORSPRUNG = 1.12
OK, FALSCH, OFFEN = "OK", "FALSCH", "NICHT GEPRUEFT"


def log(m):
    print(m, flush=True)


def http_get(url, versuche=3, pause=8):
    for i in range(versuche):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and i < versuche - 1:
                time.sleep(pause * (i + 1))
                continue
            return None
        except Exception:  # noqa: BLE001
            if i < versuche - 1:
                time.sleep(pause * (i + 1))
                continue
            return None
    return None


# ── PNG lesen, ohne Pillow ───────────────────────────────────────────

def png_grau_raster(rohbytes, raster=RASTER):
    """PNG -> graues raster*raster-Gitter, auf die mittlere Helligkeit
    normiert. Gibt None zurueck, wenn die Datei kein lesbares PNG ist —
    ein nicht lesbares Bild ist keine Aussage, sondern eine Luecke."""
    try:
        if not rohbytes or rohbytes[:8] != b"\x89PNG\r\n\x1a\n":
            return None
        pos, breit, hoch, tiefe, art, verschraenkt = 8, 0, 0, 0, 0, 1
        daten = []
        while pos + 8 <= len(rohbytes):
            laenge, typ = struct.unpack(">I4s", rohbytes[pos:pos + 8])
            koerper = rohbytes[pos + 8:pos + 8 + laenge]
            pos += 12 + laenge
            if typ == b"IHDR":
                breit, hoch, tiefe, art, _, _, verschraenkt = struct.unpack(">IIBBBBB", koerper)
            elif typ == b"IDAT":
                daten.append(koerper)
            elif typ == b"IEND":
                break
        if not (breit and hoch and daten) or tiefe != 8 or verschraenkt:
            return None
        kanaele = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(art)
        if not kanaele or art == 3:      # Farbtabelle wird hier nicht gebraucht
            return None
        roh = zlib.decompress(b"".join(daten))
        zeile = breit * kanaele
        if len(roh) < (zeile + 1) * hoch:
            return None

        # Entfiltern, dabei gleich in Kaesten summieren.
        summe = [0.0] * (raster * raster)
        zahl = [0] * (raster * raster)
        vorher = bytearray(zeile)
        p = 0
        for y in range(hoch):
            f = roh[p]
            jetzt = bytearray(roh[p + 1:p + 1 + zeile])
            p += 1 + zeile
            if f == 1:
                for i in range(kanaele, zeile):
                    jetzt[i] = (jetzt[i] + jetzt[i - kanaele]) & 0xFF
            elif f == 2:
                for i in range(zeile):
                    jetzt[i] = (jetzt[i] + vorher[i]) & 0xFF
            elif f == 3:
                for i in range(zeile):
                    links = jetzt[i - kanaele] if i >= kanaele else 0
                    jetzt[i] = (jetzt[i] + ((links + vorher[i]) >> 1)) & 0xFF
            elif f == 4:
                for i in range(zeile):
                    a = jetzt[i - kanaele] if i >= kanaele else 0
                    b = vorher[i]
                    c = vorher[i - kanaele] if i >= kanaele else 0
                    pp = a + b - c
                    pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                    vor = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    jetzt[i] = (jetzt[i] + vor) & 0xFF
            elif f != 0:
                return None
            ky = (y * raster) // hoch
            for x in range(breit):
                i = x * kanaele
                if kanaele >= 3:
                    w = (jetzt[i] * 299 + jetzt[i + 1] * 587 + jetzt[i + 2] * 114) // 1000
                else:
                    w = jetzt[i]
                k = ky * raster + (x * raster) // breit
                summe[k] += w
                zahl[k] += 1
            vorher = jetzt
        if not all(zahl):
            return None
        werte = [summe[i] / zahl[i] for i in range(len(summe))]
        mittel = sum(werte) / len(werte) or 1.0
        return [w / mittel for w in werte]
    except Exception:  # noqa: BLE001
        return None


def abstand(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / float(len(a))


# ── Die Pruefung ─────────────────────────────────────────────────────

def basisbilder():
    """(SET, NUMMER) -> Bildadresse des Basisdrucks aus der Kartendatenbank."""
    import glob  # noqa: PLC0415
    aus = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, "cards_chunk_*.json"))):
        try:
            with open(pfad, encoding="utf-8") as f:
                karten = json.load(f)
        except Exception:  # noqa: BLE001
            continue
        for c in karten:
            s = str(c.get("set") or "").upper()
            n = str(c.get("number") or "").lstrip("0") or "0"
            bild = c.get("image_url") or ""
            if s and n and bild and (s, n) not in aus:
                aus[(s, n)] = bild
    return aus


def _schluessel_teile(schluessel):
    teile = str(schluessel).split("-", 1)
    if len(teile) != 2:
        return None
    return teile[0].upper(), (teile[1].lstrip("0") or "0")


def pruefe(index, frist=None, pause=0.35, nur_offene=True, serien=None,
           ausgabe=log):
    """Urteilt ueber die Eintraege von `index` (der geladenen
    prizepack_official_images.json) und gibt {schluessel: urteil} zurueck.

    `nur_offene`: Eintraege, die schon ein Urteil OK oder FALSCH tragen
    UND deren Bildadresse sich nicht geaendert hat, werden nicht erneut
    geladen. So kostet ein Wochenlauf nach dem ersten Mal fast nichts.
    `frist`: Zeitpunkt (time.time()-Skala), ab dem abgebrochen wird — was
    gemessen ist, bleibt gemessen; der Rest bleibt offen.
    """
    basis = basisbilder()
    ausgabe("Kartendatenbank: %d Drucke mit Bild" % len(basis))
    je_serie = {}
    for schluessel, e in index.items():
        s = str((e or {}).get("series") or "")
        if not s.isdigit() or (serien and int(s) not in serien):
            continue
        je_serie.setdefault(int(s), []).append(schluessel)

    urteile = {}
    for serie in sorted(je_serie):
        schluessel_liste = sorted(je_serie[serie],
                                  key=lambda k: int(index[k].get("num") or 0))
        offen = []
        for k in schluessel_liste:
            e = index[k]
            fertig = e.get("pruefung") or ""
            gleiche_adresse = (e.get("pruefadresse") or "") == (e.get("en") or e.get("de") or "")
            if nur_offene and gleiche_adresse and (
                    fertig.startswith(OK) or fertig.startswith(FALSCH)):
                continue
            offen.append(k)
        ausgabe("")
        ausgabe("Serie %d: %d Eintraege, davon %d offen"
                % (serie, len(schluessel_liste), len(offen)))
        if not offen:
            continue

        # Galeriebilder der ganzen Serie — der Rang braucht sie alle.
        galerie = {}
        for k in schluessel_liste:
            e = index[k]
            nummer = str(e.get("num") or "")
            url = e.get("en") or e.get("de") or ""
            if not nummer or not url:
                continue
            if frist and time.time() > frist:
                ausgabe("  Frist erreicht — die restlichen Eintraege bleiben offen")
                break
            g = png_grau_raster(http_get(url))
            time.sleep(pause)
            if g:
                galerie[nummer] = g
            else:
                ausgabe("  Galeriebild %s nicht lesbar" % nummer)
        if len(galerie) < 2:
            ausgabe("  zu wenige Galeriebilder gelesen — Serie bleibt offen")
            continue

        for k in offen:
            e = index[k]
            nummer = str(e.get("num") or "")
            teile = _schluessel_teile(k)
            adresse = e.get("en") or e.get("de") or ""
            if frist and time.time() > frist:
                ausgabe("  Frist erreicht — %d Eintraege bleiben offen"
                        % (len(offen) - list(offen).index(k)))
                break
            basisurl = basis.get(teile) if teile else None
            if not basisurl:
                urteile[k] = {"urteil": OFFEN, "grund": "kein Basisdruck in der Kartendatenbank",
                              "adresse": adresse}
                continue
            b = png_grau_raster(http_get(basisurl))
            time.sleep(pause)
            if not b:
                urteile[k] = {"urteil": OFFEN, "grund": "Basisbild nicht lesbar",
                              "adresse": adresse}
                continue
            rang = sorted((abstand(g, b), n) for n, g in galerie.items())
            beste, bestnummer = rang[0]
            zweite = rang[1][0]
            eigen = next((d for d, n in rang if n == nummer), None)
            if eigen is None:
                urteile[k] = {"urteil": OFFEN, "grund": "eigenes Galeriebild nicht lesbar",
                              "adresse": adresse}
            elif zweite <= beste * VORSPRUNG:
                urteile[k] = {"urteil": OFFEN, "grund": "kein klarer Treffer",
                              "adresse": adresse, "abstand": round(beste, 4)}
            elif bestnummer == nummer:
                urteile[k] = {"urteil": OK, "grund": "", "adresse": adresse,
                              "abstand": round(beste, 4)}
            else:
                urteile[k] = {"urteil": FALSCH, "adresse": adresse,
                              "grund": "Bild %s passt besser (Versatz %+d)"
                                       % (bestnummer, int(bestnummer) - int(nummer)),
                              "abstand": round(beste, 4)}

        zahl = {}
        for k in offen:
            u = (urteile.get(k) or {}).get("urteil")
            if u:
                zahl[u] = zahl.get(u, 0) + 1
        ausgabe("  Urteile: %s" % zahl)
        for k in offen:
            u = urteile.get(k)
            if u and u["urteil"] != OK:
                ausgabe("   %-10s Nr %-3s %-26s %s %s"
                        % (k, index[k].get("num"), (index[k].get("name_en") or "")[:26],
                           u["urteil"], u["grund"]))
    return urteile


def eintragen(index, urteile, stand=None):
    """Schreibt die Urteile in die Eintraege. `geprueft` ist genau dann
    wahr, wenn das Bild NACHGEMESSEN zur Karte gehoert."""
    stand = stand or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for k, u in urteile.items():
        e = index.get(k)
        if not isinstance(e, dict):
            continue
        e["geprueft"] = (u["urteil"] == OK)
        e["pruefung"] = u["urteil"] + ((": " + u["grund"]) if u.get("grund") else "")
        e["pruefadresse"] = u.get("adresse") or ""
        e["pruefstand"] = stand
    return index


def bilanz(index):
    aus = {"geprueft": 0, "falsch": 0, "offen": 0}
    for e in index.values():
        if not isinstance(e, dict):
            continue
        p = e.get("pruefung") or ""
        if e.get("geprueft") is True:
            aus["geprueft"] += 1
        elif p.startswith(FALSCH):
            aus["falsch"] += 1
        else:
            aus["offen"] += 1
    return aus


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=os.path.join(DATA, "prizepack_official_images.json"))
    ap.add_argument("--serie", action="append", type=int, default=None)
    ap.add_argument("--pause", type=float, default=0.35)
    ap.add_argument("--sekunden", type=float, default=540.0,
                    help="Frist; danach bleibt der Rest offen")
    ap.add_argument("--alles-neu", action="store_true",
                    help="auch schon geurteilte Eintraege erneut messen")
    ap.add_argument("--trocken", action="store_true", help="nichts schreiben")
    a = ap.parse_args()

    with open(a.json, encoding="utf-8") as f:
        index = json.load(f)
    urteile = pruefe(index, frist=time.time() + a.sekunden, pause=a.pause,
                     nur_offene=not a.alles_neu,
                     serien=a.serie)
    eintragen(index, urteile)
    log("")
    log("Bilanz: %s" % bilanz(index))
    if a.trocken:
        log("(trocken — nichts geschrieben)")
        return 0
    tmp = a.json + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    os.replace(tmp, a.json)
    log("Geschrieben: %s" % a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
