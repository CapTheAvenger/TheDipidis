#!/usr/bin/env python3
"""Haelt jede Prize-Pack-Kachel GEGEN DAS BILD, das sie zeigt.

ANLASS (Betreiber, 25.09.2026, Bildschirmfoto)
----------------------------------------------
Im Rarity Switcher von **Metang** stand als dritte Wahl

    „Prize-Pack-Print (gestempelt) · Prize-Pack-Serie 7 · TEF 114“

und darunter das Artwork von **Benesaru (Munkidori)**. Die Zuordnung
Druck -> Galeriebild ist also mindestens an einer Stelle falsch.

WARUM DAS UEBERHAUPT PASSIEREN KANN
-----------------------------------
`scripts/build_prizepack_official_images.py` leitet die Bildnummer aus der
ZEILENNUMMER der offiziellen PDF-Kartenliste ab („die PDF-Zeile entspricht
der Galerienummer“). Diese Annahme ist an EINER Karte geprueft worden
(SE9, Zeile 19 = Mega-Dragoran-ex). Sie ist nicht messbar falsch oder
richtig — sie ist ungeprueft, und eine ungepruefte Annahme, aus der eine
Bildadresse wird, zeigt dem Nutzer im Fehlerfall eine andere Karte.
Eine Zeile, die das Zeilenmuster nicht trifft, verschiebt alles danach,
ohne eine Luecke zu hinterlassen: das Ergebnis sieht bis zur letzten
Zeile plausibel aus.

WAS HIER GEMESSEN WIRD
----------------------
Zwei unabhaengige Bilder derselben Karte:

    A  das gestempelte Galeriebild (CloudFront, Nummer aus unseren Daten)
    B  der Basisdruck aus der eigenen Kartendatenbank (Limitless-CDN,
       gefunden ueber (set, number) — nie ueber den Namen, CLAUDE.md)

Beide werden auf ein graues 64x64-Raster gebracht und ueber die
mittlere absolute Abweichung verglichen. Entscheidend ist NICHT der
Abstand selbst, sondern der RANG: gehoert Bild A zu der Karte, die
unsere Daten behaupten, muss B unter allen Basisdrucken derselben Serie
der naechste sein. Ist ein anderer naeher — und zwar deutlich —, ist die
Zuordnung falsch, und die Differenz der Galerienummern sagt, um wie viel
verschoben.

Wo der Abstand keine klare Aussage hergibt (zweitbester fast gleich
nah), steht **NICHT GEPRUEFT**, nicht „OK“. Ein Bild, das gar nicht
laedt, ist ebenfalls NICHT GEPRUEFT.

Der Bericht landet in data/_prizepack_galerie_pruefung.json und als
Tabelle im Lauf-Protokoll. Das Skript aendert die Daten NICHT.
"""
import argparse
import glob
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}
RASTER = 64
# Ab welcher Ueberlegenheit ein Treffer als Aussage gilt: der beste
# Abstand muss um diesen Faktor besser sein als der zweitbeste. 1.15 ist
# kein Naturgesetz, sondern eine Vorsichtsmarke — darunter heisst es
# NICHT GEPRUEFT.
VORSPRUNG = 1.15


def log(m):
    print(m, flush=True)


def http_get(url, retries=4):
    backoff = [5, 15, 40, 90]
    last = None
    for versuch in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (403, 429) and versuch < retries - 1:
                time.sleep(backoff[min(versuch, len(backoff) - 1)])
                continue
            return None
        except Exception as e:  # noqa: BLE001
            last = e
            if versuch < retries - 1:
                time.sleep(backoff[min(versuch, len(backoff) - 1)])
                continue
            return None
    if last:
        log("    %s: %s" % (url.rsplit("/", 1)[-1], last))
    return None


def raster(rohbytes):
    """Graues RASTERxRASTER-Gitter, auf die mittlere Helligkeit normiert."""
    from PIL import Image  # noqa: PLC0415
    try:
        b = Image.open(io.BytesIO(rohbytes))
        b = b.convert("L").resize((RASTER, RASTER), Image.BILINEAR)
    except Exception:  # noqa: BLE001
        return None
    p = list(b.getdata())
    # Helligkeit normalisieren: der Stempel und der Galerie-Hintergrund
    # aendern die Gesamthelligkeit, nicht das Motiv.
    mw = sum(p) / float(len(p)) or 1.0
    return [x / mw for x in p]


def abstand(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / float(len(a))


def basisbilder():
    """(SET, NUMMER) -> (Bildadresse, name_en) aus der Kartendatenbank."""
    aus = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, "cards_chunk_*.json"))):
        with open(pfad, encoding="utf-8") as f:
            for c in json.load(f):
                s = str(c.get("set") or "").upper()
                n = str(c.get("number") or "").lstrip("0") or "0"
                bild = c.get("image_url") or ""
                if s and n and bild:
                    aus.setdefault((s, n), (bild, c.get("name_en") or ""))
    return aus


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--serie", action="append", type=int, default=None,
                   help="nur diese Serie(n) pruefen")
    p.add_argument("--pause", type=float, default=0.4)
    p.add_argument("--montage", default="",
                   help="PNG mit den Galeriebildern rund um einen Fund")
    p.add_argument("--montage-serie", type=int, default=0)
    p.add_argument("--montage-von", type=int, default=0)
    p.add_argument("--montage-bis", type=int, default=0)
    a = p.parse_args()

    quelle = os.path.join(DATA, "prizepack_official_images.json")
    with open(quelle, encoding="utf-8") as f:
        eintraege = json.load(f)
    basis = basisbilder()
    log("Kartendatenbank: %d Drucke mit Bild" % len(basis))

    je_serie = {}
    for schluessel, e in eintraege.items():
        s = str(e.get("series") or "")
        if not s.isdigit():
            continue
        if a.serie and int(s) not in a.serie:
            continue
        je_serie.setdefault(int(s), []).append((schluessel, e))

    if a.montage and a.montage_serie:
        montage(a, je_serie)
        return 0

    bericht = {"raster": RASTER, "vorsprung": VORSPRUNG, "serien": {}}
    for serie in sorted(je_serie):
        gruppe = sorted(je_serie[serie], key=lambda x: int(x[1].get("num") or 0))
        log("")
        log("Serie %d: %d Eintraege" % (serie, len(gruppe)))

        # A: gestempelte Bilder, je Galerienummer
        gestempelt = {}
        for schluessel, e in gruppe:
            nummer = str(e.get("num") or "")
            url = e.get("en") or e.get("de") or ""
            if not nummer or not url:
                continue
            roh = http_get(url)
            time.sleep(a.pause)
            g = raster(roh) if roh else None
            if g:
                gestempelt[nummer] = g
            else:
                log("  Galeriebild %s nicht lesbar (%s)" % (nummer, url))

        # B: Basisdrucke, je Eintrag
        grund = {}
        for schluessel, e in gruppe:
            teile = schluessel.split("-", 1)
            if len(teile) != 2:
                continue
            paar = basis.get((teile[0].upper(), teile[1].lstrip("0") or "0"))
            if not paar:
                log("  %s: kein Basisdruck in der Kartendatenbank" % schluessel)
                continue
            roh = http_get(paar[0])
            time.sleep(a.pause)
            g = raster(roh) if roh else None
            if g:
                grund[schluessel] = g
            else:
                log("  %s: Basisbild nicht lesbar" % schluessel)

        zeilen = []
        for schluessel, e in gruppe:
            nummer = str(e.get("num") or "")
            name = e.get("name_en") or ""
            b = grund.get(schluessel)
            if b is None or not gestempelt:
                zeilen.append({"druck": schluessel, "nummer": nummer, "name": name,
                               "urteil": "NICHT GEPRUEFT", "grund": "Bild fehlt"})
                continue
            rang = sorted(((abstand(g, b), n) for n, g in gestempelt.items()))
            beste, bestnummer = rang[0]
            zweite = rang[1][0] if len(rang) > 1 else beste * 99
            eigen = next((d for d, n in rang if n == nummer), None)
            if eigen is None:
                urteil, grundtext = "NICHT GEPRUEFT", "eigenes Galeriebild fehlt"
            elif zweite <= beste * VORSPRUNG:
                urteil, grundtext = "NICHT GEPRUEFT", "kein klarer Treffer"
            elif bestnummer == nummer:
                urteil, grundtext = "OK", ""
            else:
                urteil = "FALSCH"
                grundtext = "Bild %s passt besser (Versatz %+d)" % (
                    bestnummer, int(bestnummer) - int(nummer))
            zeilen.append({"druck": schluessel, "nummer": nummer, "name": name,
                           "urteil": urteil, "grund": grundtext,
                           "abstand_eigen": round(eigen, 4) if eigen is not None else None,
                           "abstand_beste": round(beste, 4),
                           "beste_nummer": bestnummer})

        zahl = {}
        for z in zeilen:
            zahl[z["urteil"]] = zahl.get(z["urteil"], 0) + 1
        versatz = {}
        for z in zeilen:
            if z["urteil"] == "FALSCH":
                v = int(z["beste_nummer"]) - int(z["nummer"])
                versatz[v] = versatz.get(v, 0) + 1
        log("  Urteile: %s" % zahl)
        if versatz:
            log("  Versatz (bestes Bild minus unsere Nummer): %s" % versatz)
        for z in zeilen:
            if z["urteil"] != "OK":
                log("   %-10s %-3s %-28s %s %s" % (z["druck"], z["nummer"],
                                                   z["name"][:28], z["urteil"], z["grund"]))
        bericht["serien"][str(serie)] = {"zeilen": zeilen, "zahl": zahl, "versatz": versatz}

    ziel = os.path.join(DATA, "_prizepack_galerie_pruefung.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(bericht, f, ensure_ascii=False, indent=1, sort_keys=True)
    log("")
    log("Bericht: %s" % ziel)
    return 0


def montage(a, je_serie):
    """Die Galeriebilder von --montage-von bis --montage-bis nebeneinander,
    darunter die Basisdrucke, die unsere Daten ihnen zuordnen. Zum
    HINSEHEN — eine Zahl ersetzt kein Bild, wenn die Frage „welche Karte
    ist das“ lautet."""
    from PIL import Image  # noqa: PLC0415
    gruppe = {str(e.get("num")): (s, e) for s, e in je_serie.get(a.montage_serie, [])}
    basis = basisbilder()
    breit, hoch = 220, 300
    nummern = [str(n) for n in range(a.montage_von, a.montage_bis + 1) if str(n) in gruppe]
    blatt = Image.new("RGB", (breit * max(1, len(nummern)), hoch * 2), (255, 255, 255))
    for i, n in enumerate(nummern):
        schluessel, e = gruppe[n]
        basispaar = basis.get((schluessel.split("-")[0].upper(),
                               schluessel.split("-", 1)[1].lstrip("0") or "0"))
        for reihe, url in enumerate([e.get("en") or e.get("de") or "",
                                     (basispaar or ("",))[0]]):
            if not url:
                continue
            roh = http_get(url)
            time.sleep(a.pause)
            if not roh:
                continue
            try:
                b = Image.open(io.BytesIO(roh)).convert("RGB")
            except Exception:  # noqa: BLE001
                continue
            b.thumbnail((breit - 8, hoch - 8))
            blatt.paste(b, (i * breit + 4, reihe * hoch + 4))
        log("  Spalte %d: Galerie %s / Daten sagen %s (%s)" % (i + 1, n, schluessel,
                                                              e.get("name_en")))
    blatt.save(a.montage)
    log("Montage: %s  (oben Galeriebild, unten Basisdruck aus unseren Daten)" % a.montage)


if __name__ == "__main__":
    sys.exit(main())
