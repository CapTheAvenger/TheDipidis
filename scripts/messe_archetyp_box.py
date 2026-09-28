#!/usr/bin/env python3
"""Archetyp-Box (FE-13) einmal komplett durchspielen und messen.

Lokal, gegen den ausgelieferten Baum, mit einem ERSATZKONTO im Speicher
(window.auth / window.db werden nach dem Laden durch eine kleine
Nachbildung ersetzt) — es wird nichts in die echte Datenbank geschrieben.

Ablauf und Messpunkte:
  1. Rotationen, "Alle Formate", Archetyp, Kartenanteil-Filter
     -> Knopf sichtbar? Zahl im Knopf = Karten der Uebersicht?
  2. Knopf -> Box im Konto. Jede Karte der Box = ein Kaertchen der
     Uebersicht (Set und Nummer), und keins fehlt.
  3. Einzelnes Format -> Knopf verschwindet.
  4. "Box oeffnen" -> Profil-Untertab, drei Rubriken.
  5. Status setzen, Proxys drucken -> Druckliste.
  6. Aktualisieren: zwei Karten aus der gespeicherten Box entfernt und den
     Datenstand zurueckgedreht -> Hinweis "neue Turnierdaten", danach genau
     diese zwei Karten als "neu".
  7. Karte von Hand hinzufuegen.
  8. 390 px: kein waagerechter Ueberlauf.

AUFRUF
    python3 -m http.server 8000 --bind 127.0.0.1 &
    python3 scripts/messe_archetyp_box.py --archetyp Dragapult --filter 50
"""
import argparse
import json
import sys

ERSATZKONTO = r"""
() => {
  const speicher = window.__abxSpeicher = window.__abxSpeicher || {};
  let zaehler = 0;
  const docRef = (pfad) => ({
    id: pfad.split('/').pop(),
    set: (d) => { speicher[pfad] = JSON.parse(JSON.stringify(d)); return Promise.resolve(); },
    get: () => Promise.resolve({ exists: pfad in speicher, data: () => speicher[pfad] }),
    delete: () => { delete speicher[pfad]; return Promise.resolve(); },
    collection: (n) => colRef(pfad + '/' + n),
  });
  const colRef = (pfad) => ({
    doc: (id) => docRef(pfad + '/' + (id || ('test' + (++zaehler)))),
    get: () => Promise.resolve({ docs: Object.keys(speicher)
      .filter(k => k.startsWith(pfad + '/') && k.slice(pfad.length + 1).indexOf('/') < 0)
      .map(k => ({ id: k.split('/').pop(), data: () => JSON.parse(JSON.stringify(speicher[k])) })) }),
  });
  window.auth = { currentUser: { uid: 'TESTKONTO', email: 'test@example.invalid' } };
  window.db = { collection: (n) => colRef(n) };
  return true;
}
"""


# Das Ersatzkonto meldet sich nicht bei der Seite selbst an; der
# angemeldete Profilbereich wird deshalb von Hand sichtbar gemacht.
PROFIL_SICHTBAR = """() => { ArchetypBox.oeffnen();
    const c = document.getElementById('profile-content'); if (c) c.classList.remove('d-none');
    document.querySelectorAll('#profile .auth-required-overlay, #profile-login-prompt').forEach(e => e.classList.add('d-none')); }"""


def warte_bis(s, ausdruck, sekunden, arg=None):
    for _ in range(int(sekunden * 2)):
        try:
            if s.evaluate(ausdruck, arg) if arg is not None else s.evaluate(ausdruck):
                return True
        except Exception:
            pass
        s.wait_for_timeout(500)
    return False


def main():
    from playwright.sync_api import sync_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000/index.html")
    ap.add_argument("--archetyp", default="Dragapult")
    ap.add_argument("--filter", default="50")
    ap.add_argument("--bilder", default="", help="Ordner fuer Ausschnitte (Knopf, Box 1280/390 px)")
    a = ap.parse_args()
    fehler = []

    def pruefe(bed, text):
        print(("OK    " if bed else "FEHLER") + " " + text)
        if not bed:
            fehler.append(text)

    with sync_playwright() as p:
        b = p.chromium.launch()
        s = b.new_page(viewport={"width": 1280, "height": 900})
        s.add_init_script("try { localStorage.setItem('app_lang', 'de'); } catch (e) {}")
        konsole = []
        s.on("pageerror", lambda e: konsole.append(str(e)))
        s.goto(a.url, wait_until="load", timeout=90000)
        # Der Service Worker laedt beim Erstbesuch einmal neu — erst warten,
        # bis die Seite steht, dann das Ersatzkonto setzen.
        warte_bis(s, "() => typeof switchTabAndUpdateMenu === 'function' && !!window.ArchetypBox", 90)
        s.wait_for_timeout(6000)
        warte_bis(s, "() => typeof switchTabAndUpdateMenu === 'function' && !!window.ArchetypBox", 90)
        s.evaluate(ERSATZKONTO)

        # 1. Rotationen, Alle Formate
        s.evaluate("() => switchTabAndUpdateMenu('past-meta')")
        warte_bis(s, "() => window.pastMetaLoaded === true", 120)
        s.evaluate("""() => { const f = document.getElementById('pastMetaFormatFilter');
            f.value = 'all'; f.dispatchEvent(new Event('change', {bubbles: true})); }""")
        warte_bis(s, "() => (window._pastMetaLoadedChunks||new Set()).size >= (window._pastMetaManifest.meta_keys.length)", 400)
        warte_bis(s, "n => [...document.getElementById('pastMetaDeckSelect').options].some(o => o.value === n)", 60, a.archetyp)
        s.evaluate("""([n, f]) => { const fs = document.getElementById('pastMetaFilterSelect'); fs.value = f;
            const d = document.getElementById('pastMetaDeckSelect'); d.value = n;
            d.dispatchEvent(new Event('change', {bubbles: true})); }""", [a.archetyp, a.filter])
        warte_bis(s, "() => !document.getElementById('pastMetaArchetypBoxBtn').classList.contains('d-none')", 60)
        s.wait_for_timeout(4000)
        knopf = s.evaluate("""() => { const k = document.getElementById('pastMetaArchetypBoxBtn');
            return { sichtbar: !k.classList.contains('d-none'), text: k.textContent,
                     karten: pastMetaFilteredCards.length }; }""")
        print("Knopf:", json.dumps(knopf, ensure_ascii=False))
        pruefe(knopf["sichtbar"], "Knopf sichtbar bei Alle Formate + Archetyp")
        pruefe("(%d)" % knopf["karten"] in knopf["text"], "Zahl im Knopf = Karten der Uebersicht (%d)" % knopf["karten"])

        # 2. Anlegen
        if a.bilder:
            s.evaluate("() => document.getElementById('pastMetaCardsSection').scrollIntoView()")
            s.locator(".past-meta-cards-header").first.screenshot(path=a.bilder + "/abx-knopf-1280.png")
        s.evaluate("() => ArchetypBox.ausUebersicht()")
        warte_bis(s, "() => Object.keys(window.__abxSpeicher).length === 1", 30)
        box = s.evaluate("() => Object.values(window.__abxSpeicher)[0]")
        kacheln = s.evaluate("""() => [...document.querySelectorAll('#pastMetaDeckGrid .card-item')]
            .map(k => (k.dataset.cardSet + '-' + k.dataset.cardNumber).toUpperCase().replace(/-0+(?=\\w)/, '-'))""")
        ids = [k["id"] for k in box["karten"]]
        print("Box: %d Karten, Uebersicht: %d Kaertchen, Schwelle %s, Daten bis %s"
              % (len(ids), len(kacheln), box["schwelle"], box["datenStand"]))
        pruefe(len(ids) == knopf["karten"], "Box hat so viele Karten wie die Uebersicht zeigt")
        pruefe(sorted(ids) == sorted(set(kacheln)), "jede Karte der Box ist ein Kaertchen der Uebersicht (Set/Nummer), keins fehlt")
        pruefe(all(k["status"] == "fehlt" and not k.get("neu") for k in box["karten"]), "alle 'fehlt', keine Neu-Marke")
        hinweis = s.evaluate("() => document.getElementById('pastMetaArchetypBoxHinweis').textContent")
        pruefe("angelegt" in hinweis, "Rueckmeldung: " + hinweis.strip()[:90])
        s.wait_for_timeout(1000)
        pruefe("aktualisieren" in s.evaluate("() => document.getElementById('pastMetaArchetypBoxBtn').textContent"),
               "Knopf heisst jetzt 'Archetyp-Box aktualisieren'")

        # 3. Einzelnes Format
        s.evaluate("""() => { const f = document.getElementById('pastMetaFormatFilter');
            f.value = window._pastMetaManifest.meta_keys[0]; f.dispatchEvent(new Event('change', {bubbles: true})); }""")
        s.wait_for_timeout(4000)
        pruefe(s.evaluate("() => document.getElementById('pastMetaArchetypBoxBtn').classList.contains('d-none')"),
               "Knopf verschwindet bei einem einzelnen Format")

        # 4. Box oeffnen
        s.evaluate(PROFIL_SICHTBAR)
        warte_bis(s, "() => document.querySelectorAll('#abxInhalt .abx-karte').length > 0", 30)
        z = s.evaluate("""() => ({ fehlt: document.querySelectorAll('.abx-rubrik-fehlt .abx-karte').length,
            original: document.querySelectorAll('.abx-rubrik-original .abx-karte').length,
            proxy: document.querySelectorAll('.abx-rubrik-proxy .abx-karte').length,
            reihenfolge: [...document.querySelectorAll('.abx-rubrik')].map(r => r.className.split('abx-rubrik-')[1]),
            sichtbar: getComputedStyle(document.getElementById('profile-archetypbox')).display !== 'none' })""")
        print("Rubriken:", z)
        pruefe(z["sichtbar"] and z["fehlt"] == len(ids), "Profil zeigt die Box, alle Karten unter 'Noch nicht in der Box'")
        pruefe(z["reihenfolge"] == ["fehlt", "original", "proxy"], "Reihenfolge fehlt / Original / Proxy")

        # 4b. Nachtrag 28.09.: gefordert / drin / Drucke / Wunschliste
        SP = "() => Object.values(window.__abxSpeicher)[0].karten"
        erste = s.evaluate('''() => { const t = document.querySelector('.abx-rubrik-fehlt .abx-karte');
            return { id: t.dataset.karte, soll: (t.querySelector('.abx-soll')||{}).textContent,
                     drin: t.querySelector('.abx-anzahl').textContent,
                     herzen: document.querySelectorAll('#abxInhalt .abx-karte .abx-herz').length,
                     kacheln: document.querySelectorAll('#abxInhalt .abx-karte').length }; }''')
        k0 = [k for k in s.evaluate(SP) if k["id"] == erste["id"]][0]
        print("erste Karte:", erste, "gefordert im Konto:", k0.get("gefordert"), "max_count:", k0.get("maxAnzahl"))
        pruefe(str(k0.get("gefordert")) == erste["soll"] == str(k0.get("maxAnzahl")),
               "Plakette oben links = hoechstens gespielt (max_count %s)" % k0.get("maxAnzahl"))
        pruefe(erste["drin"] == "0", "Plakette unten rechts = 0 drin")
        pruefe(erste["herzen"] == erste["kacheln"], "jede Karte hat das Wunschlisten-Herz")
        kid = erste["id"]
        sel = "document.querySelector('.abx-karte[data-karte=\"%s\"]')" % kid
        s.evaluate("() => %s.querySelectorAll('.abx-mini')[1].click()" % sel)   # +
        s.wait_for_timeout(300)
        k1 = [k for k in s.evaluate(SP) if k["id"] == kid][0]
        pruefe(k1["status"] == "original" and sum(d["n"] for d in k1["drucke"]) == 1,
               "+ auf fehlender Karte: 1 drin, jetzt Original")
        s.evaluate("() => %s.querySelector('.abx-soll').click()" % sel)
        s.wait_for_timeout(300)
        k2 = [k for k in s.evaluate(SP) if k["id"] == kid][0]
        pruefe(sum(d["n"] for d in k2["drucke"]) == k2["gefordert"], "Tippen auf 'gefordert' fuellt auf %s" % k2["gefordert"])
        s.evaluate("() => %s.querySelectorAll('.abx-mini')[1].click()" % sel)
        s.wait_for_timeout(300)
        k3 = [k for k in s.evaluate(SP) if k["id"] == kid][0]
        pruefe(sum(d["n"] for d in k3["drucke"]) == k2["gefordert"] + 1, "+ geht ueber 'gefordert' hinaus")
        s.evaluate("() => %s.querySelector('.abx-drucke-btn').click()" % sel)
        warte_bis(s, "() => !document.getElementById('abxDruckDialog').classList.contains('d-none')", 10)
        zeilen = s.evaluate("() => document.querySelectorAll('#abxDruckDialog .abx-dialog-druck').length")
        print("Druck-Dialog: %d Drucke" % zeilen)
        pruefe(zeilen >= 1, "Druck-Dialog zeigt die Drucke der Karte (%d)" % zeilen)
        if zeilen >= 2:
            s.evaluate("() => { ArchetypBox._druck(0, -2); ArchetypBox._druck(1, 2); }")
            s.evaluate("() => document.querySelector('#abxDruckDialog .abx-dialog-fuss .btn-primary').click()")
            s.wait_for_timeout(300)
            k4 = [k for k in s.evaluate(SP) if k["id"] == kid][0]
            gesamt = sum(d["n"] for d in k4["drucke"])
            pruefe(len(k4["drucke"]) == 2 and gesamt == k2["gefordert"] + 1,
                   "Aufteilung gespeichert: %s" % [(d["id"], d["n"]) for d in k4["drucke"]])
            weitere = s.evaluate("() => (%s.querySelector('.abx-weitere')||{}).textContent || ''" % sel)
            pruefe("+1" in weitere, "Kachel nennt den zweiten Druck (%s)" % weitere)
        else:
            s.evaluate("() => ArchetypBox.druckeSchliessen(false)")

        # 5. Status, Proxy-Druck
        s.evaluate("() => document.querySelector('.abx-rubrik-fehlt .abx-seg-original').click()")
        s.evaluate("() => document.querySelector('.abx-rubrik-fehlt .abx-seg-proxy').click()")
        s.evaluate("() => document.querySelector('.abx-rubrik-fehlt .abx-seg-proxy').click()")
        s.wait_for_timeout(500)
        gespeichert = s.evaluate("() => Object.values(window.__abxSpeicher)[0].karten.map(k => k.status)")
        pruefe(gespeichert.count("original") == 2 and gespeichert.count("proxy") == 2,
               "Status im Konto: 2 Original, 2 Proxy")
        erwartet = s.evaluate("() => Object.values(window.__abxSpeicher)[0].karten.filter(k => k.status === 'proxy').reduce((a, k) => a + k.drucke.reduce((x, d) => x + d.n, 0), 0)")
        s.evaluate("() => { window.proxyQueue = []; }")
        s.evaluate("() => document.querySelector('.abx-druck-btn').click()")
        s.wait_for_timeout(1500)
        q = s.evaluate("() => ({ n: (window.proxyQueue||[]).reduce((a, i) => a + i.count, 0), zeilen: (window.proxyQueue||[]).length, tab: getComputedStyle(document.getElementById('proxy')).display !== 'none' })")
        pruefe(q["zeilen"] == 2 and q["n"] == erwartet and q["tab"], "Proxy-Druck: 2 Karten, %d Kopien, Proxy-Reiter offen (%s)" % (erwartet, q))

        # 6. Aktualisieren
        s.evaluate("""() => { const k = Object.keys(window.__abxSpeicher)[0]; const b = window.__abxSpeicher[k];
            const weg = b.karten.filter(x => x.status === 'fehlt').slice(-2);
            window.__abxWeg = weg.map(x => x.id);
            b.karten = b.karten.filter(x => !window.__abxWeg.includes(x.id)); b.datenStand = '2000-01-01'; }""")
        s.evaluate(PROFIL_SICHTBAR)
        warte_bis(s, "() => !!document.querySelector('.abx-neudaten')", 30)
        pruefe(s.evaluate("() => !!document.querySelector('.abx-neudaten')"), "Hinweis auf neue Turnierdaten erscheint")
        s.evaluate("() => document.getElementById('abxAktualisierenBtn').click()")
        warte_bis(s, "() => !!document.querySelector('.abx-ergebnis')", 300)
        erg = s.evaluate("""() => ({ satz: (document.querySelector('.abx-ergebnis')||{}).textContent,
            neu: Object.values(window.__abxSpeicher)[0].karten.filter(k => k.neu).map(k => k.id).sort(),
            weg: window.__abxWeg.slice().sort(), marken: document.querySelectorAll('.abx-marke-neu').length,
            status: Object.values(window.__abxSpeicher)[0].karten.map(k => k.status),
            hinweis: !!document.querySelector('.abx-neudaten') })""")
        print("Aktualisieren:", json.dumps(erg, ensure_ascii=False)[:400])
        pruefe(erg["neu"] == erg["weg"], "genau die zwei entfernten Karten kommen als 'neu' zurueck")
        pruefe(erg["marken"] == 2, "zwei Neu-Marken sichtbar")
        pruefe(erg["status"].count("original") == 2 and erg["status"].count("proxy") == 2, "Status der uebrigen Karten bleibt")
        kn = [k for k in s.evaluate(SP) if k["id"] == kid][0]
        pruefe(sum(d["n"] for d in kn["drucke"]) == k2["gefordert"] + 1, "Aktualisieren laesst die Mengen in der Box stehen")
        pruefe(not erg["hinweis"], "Hinweis auf neue Daten ist danach weg")

        # 7. Von Hand
        s.evaluate("""() => { const e = document.getElementById('abxSuche'); e.value = 'Iono';
            e.dispatchEvent(new Event('input', {bubbles: true})); }""")
        warte_bis(s, "() => document.querySelectorAll('.abx-treffer-zeile').length > 0", 30)
        vorher = s.evaluate("() => Object.values(window.__abxSpeicher)[0].karten.length")
        s.evaluate("() => { const z = [...document.querySelectorAll('.abx-treffer-zeile')]; z[z.length - 1].click(); }")
        s.wait_for_timeout(800)
        nachher = s.evaluate("() => Object.values(window.__abxSpeicher)[0].karten")
        hand = [k for k in nachher if k.get("manuell")]
        pruefe(len(nachher) in (vorher, vorher + 1), "von Hand: %d -> %d Karten %s" % (vorher, len(nachher), [k["id"] for k in hand]))

        # 8. Breiten
        for w in (390, 768, 1280):
            s.set_viewport_size({"width": w, "height": 900})
            s.wait_for_timeout(800)
            m = s.evaluate("""() => { const r = document.getElementById('abxInhalt').getBoundingClientRect();
                const sp = new Set([...document.querySelectorAll('.abx-rubrik-fehlt .abx-karte')].map(k => Math.round(k.getBoundingClientRect().left)));
                const segs = [...document.querySelectorAll('.abx-seg')].map(x => x.getBoundingClientRect().height);
                let raus = 0, oval = 0;
                document.querySelectorAll('#abxInhalt .abx-karte').forEach(k => {
                  const rk = k.getBoundingClientRect();
                  k.querySelectorAll('button').forEach(x => { const r = x.getBoundingClientRect();
                    if (r.width && (r.left < rk.left - 0.5 || r.right > rk.right + 0.5)) raus++; });
                  k.querySelectorAll('.abx-soll, .abx-herz, .abx-anzahl').forEach(x => { const r = x.getBoundingClientRect();
                    if (r.width && Math.abs(r.height - 28) > 1.5) oval++; }); });
                return { raus: raus, oval: oval, ueberlauf: document.documentElement.scrollWidth - window.innerWidth,
                         rechts: Math.round(r.right), spalten: sp.size, segMin: Math.min(...segs) }; }""")
            print("%4d px: %s" % (w, m))
            pruefe(m["ueberlauf"] <= 0, "%d px ohne waagerechten Ueberlauf" % w)
            pruefe(m["raus"] == 0, "%d px: kein Knopf ragt aus seiner Kachel (%d)" % (w, m["raus"]))
            pruefe(m["oval"] == 0, "%d px: Plaketten 28 px hoch, keine Ovale (%d)" % (w, m["oval"]))
            pruefe(m["spalten"] >= 2, "%d px mindestens zwei Spalten" % w)
        if a.bilder:
            for w in (1280, 390):
                s.set_viewport_size({"width": w, "height": 1400})
                s.wait_for_timeout(1500)
                s.evaluate("() => document.getElementById('profile-archetypbox').scrollIntoView()")
                s.wait_for_timeout(1500)
                s.screenshot(path="%s/abx-box-%d.png" % (a.bilder, w))
        # 9. Dunkler Modus: Kontrast der aktiven Knoepfe und der Plakette
        s.evaluate("() => { document.documentElement.dataset.theme = 'dark'; }")
        s.wait_for_timeout(500)
        k = s.evaluate("""() => {
          const rgb = c => (c.match(/[\\d.]+/g) || []).map(Number);
          const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const kon = el => { const cs = getComputedStyle(el); let bg = rgb(cs.backgroundColor);
            if (bg.length === 4 && bg[3] < 1) { const a = bg[3]; bg = bg.slice(0, 3).map(v => v * a + 255 * (1 - a) * 0); }
            const a = lum(rgb(cs.color)), b = lum(bg.slice(0, 3));
            return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100; };
          return [...document.querySelectorAll('.abx-seg.is-active, .abx-anzahl')].slice(0, 40).map(kon); }""")
        print("dunkel, Kontraste:", sorted(set(k))[:6])
        pruefe(k and min(k) >= 4.5, "dunkler Modus: aktive Knoepfe und Plaketten >= 4,5:1 (min %s)" % (min(k) if k else "-"))
        pruefe(not [k for k in konsole if "ArchetypBox" in k or "archetyp" in k.lower()],
               "keine Skriptfehler aus der Archetyp-Box (%d Seitenfehler gesamt)" % len(konsole))
        b.close()
    print("\n%d Fehler" % len(fehler))
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
