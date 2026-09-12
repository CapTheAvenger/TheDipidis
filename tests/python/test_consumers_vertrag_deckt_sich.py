"""Das Dokument verspricht eine Pruefung — gibt es sie auch?

BEFUND (10.09.2026)
-------------------
`data/_consumers.md` sagt woertlich:

    scripts/data_guardian.py verifies daily that EVERY file above
    exists and still has its required columns.

Gezaehlt: das Dokument beschrieb 17 Dateien, `CONSUMERS` im Waechter
fuehrte 10. **Sieben Zusicherungen gab es nur auf dem Papier** —
darunter `online_api_cards_<FORMAT>.csv`, die ueber
`backend/core/update_sets.py` den Riegel fuer `data/format_window.json`
traegt und damit den Formatschluessel der GANZEN Seite bestimmt.

Der Kommentar im Waechter sprach selbst von "diesen vier Dateien";
eingetragen waren zwei. Der Fehler ist also nicht Nachlaessigkeit,
sondern die Bauart: zwei Listen, die von Hand gleich gehalten werden
muessen, laufen auseinander, und niemand merkt es.

UND DIE GEGENRICHTUNG. `japanese_cards_database.csv` stand im
Waechtervertrag, aber in keinem Absatz des Dokuments — die Pruefung war
da, die Beschreibung fehlte.

WAS DIESER TEST HAELT
---------------------
Dass beide Listen deckungsgleich bleiben, in BEIDE Richtungen. Waechst
eine, faellt der Test, bis die andere nachzieht.

WAS ER NICHT HAELT
------------------
Ob der Waechter die Dateien inhaltlich richtig prueft. Mehrere Eintraege
stehen weiterhin mit leerer `required`-Liste da — die JSON-Dateien haben
gar keine Kopfzeile. Geprueft wird dort Vorhandensein und Nicht-Leere.

NACHTRAG 12.09.2026 — DIE VIER online_api_*-DATEIEN HABEN JETZT EINEN
SPALTENVERTRAG
-----------------------------------------------------------------------
Sie standen ohne `required` da, mit dem Vermerk: der Spaltenpruefer lese
Komma, die Dateien seien aber semikolongetrennt. Das ist behoben — der
Waechter fuehrt das Trennzeichen als `sep` an der Datei
(`consumer_sep()`), `check_schema` und `tote_spalten` benutzen es. Die
Spaltenlisten sind aus den ECHTEN Kopfzeilen abgelesen, und
`test_jede_pflichtspalte_steht_wirklich_in_der_datei` unten rechnet das
bei jedem Lauf gegen die Dateien nach — eine erfundene Spalte faellt
sofort auf.

UND DIE SPALTE, DIE NICHT STIMMT
--------------------------------
`has_decklists` in `online_api_tournaments.csv` ist die BEHAUPTUNG der
Quelle, nicht eine Messung. Gemessen 12.09.2026: ein Turnier steht auf
`False` und hat 816 Kartenzeilen; 210 Zeilen sind leer, weil bei
`depth=archetypen` /details gar nicht geholt wird. Die Spalte bleibt
unveraendert (Hausregel "report, don't silently repair"), aber
`data/_consumers.md` und der Scraper muessen es hinschreiben — sonst
filtert jemand danach. Genau das haelt
`test_die_unzuverlaessige_spalte_ist_als_solche_gekennzeichnet`.
"""

import importlib.util
import os
import re
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOK = os.path.join(WURZEL, "data", "_consumers.md")
WAECHTER = os.path.join(WURZEL, "scripts", "data_guardian.py")


def _consumers():
    spec = importlib.util.spec_from_file_location("dg_vertrag", WAECHTER)
    m = importlib.util.module_from_spec(spec)
    sys.modules["dg_vertrag"] = m
    spec.loader.exec_module(m)
    return m.CONSUMERS


def _dokumentierte_dateien():
    """Die Dateinamen aus den `###`-Ueberschriften des Dokuments.

    Ueberschriften der Form ``### `name.csv``` — Platzhalter wie
    ``<FORMAT>`` werden auf den heutigen Formatschluessel gezogen, weil
    der Waechter die konkrete Datei fuehrt.
    """
    with open(DOK, encoding="utf-8") as f:
        text = f.read()
    namen = set()
    # BEIDE Ueberschriftenformen. Das Dokument fuehrt Dateien mal als
    # `### `name.json`` und mal als `## `name.json` — was sie tut`.
    # Beim ersten Anlauf las dieser Test nur die erste Form und meldete
    # fuenf Dateien als undokumentiert, die sehr wohl beschrieben sind
    # (champions_editionen, pokemon_go_liste, pokemon_go_shiny,
    # champions_resources). Ein Test, der die eigene Datei nicht lesen
    # kann, erzeugt Arbeit statt Sicherheit.
    for zeile in re.findall(r"^#{2,3}\s+`([^`]+)`", text, re.M):
        n = zeile.strip()
        if not re.search(r"\.(csv|json|md)$", n):
            continue
        namen.add(n)
    return namen


def _format_schluessel():
    """Der heutige Formatschluessel, aus den vorhandenen Dateien gelesen —
    nicht abgeschrieben."""
    for name in os.listdir(os.path.join(WURZEL, "data")):
        m = re.match(r"^online_api_cards_(.+)\.csv$", name)
        if m:
            return m.group(1)
    return None


def _entfalte(namen):
    """`<FORMAT>` durch den heutigen Schluessel ersetzen."""
    fs = _format_schluessel()
    out = set()
    for n in namen:
        out.add(n.replace("<FORMAT>", fs) if (fs and "<FORMAT>" in n) else n)
    return out


def test_das_dokument_beschreibt_ueberhaupt_dateien():
    """Vorpruefung gegen ein leeres Bestehen."""
    d = _dokumentierte_dateien()
    assert len(d) >= 10, f"nur {len(d)} Ueberschriften gefunden — Format geaendert?"


def test_jede_dokumentierte_datei_steht_im_waechter():
    dok = _entfalte(_dokumentierte_dateien())
    waechter = set(_consumers())
    fehlen = sorted(dok - waechter)
    assert not fehlen, (
        f"{len(fehlen)} Datei(en) stehen in data/_consumers.md, aber in "
        f"keinem Waechter — das Dokument sichert taegliche Pruefung zu, "
        f"die es fuer sie nicht gibt: {fehlen}")


def test_jede_geprueft_datei_steht_auch_im_dokument():
    """Die Gegenrichtung. Eine Datei, die geprueft wird, aber nirgends
    beschrieben ist, kann ein fremder Leser nicht benutzen."""
    dok = _entfalte(_dokumentierte_dateien())
    waechter = set(_consumers())
    fehlen = sorted(waechter - dok)
    assert not fehlen, (
        f"{len(fehlen)} Datei(en) stehen im Waechtervertrag, aber in "
        f"keinem Absatz von data/_consumers.md: {fehlen}")


def test_jede_vertragsdatei_existiert_wirklich():
    fehlen = [n for n in _consumers()
              if not os.path.exists(os.path.join(WURZEL, "data", n))]
    assert not fehlen, (
        f"Der Waechter fuehrt {len(fehlen)} Datei(en), die es nicht gibt: "
        f"{fehlen}. Bei den <FORMAT>-Dateien ist das der gewollte Fall nach "
        f"einer Rotation — dann gehoert der Eintrag nachgezogen, nicht "
        f"geloescht.")


def test_der_satz_im_dokument_steht_noch_da():
    """Faellt die Zusicherung weg, ist dieser Test gegenstandslos — dann
    soll er das sagen, statt still weiterzulaufen."""
    with open(DOK, encoding="utf-8") as f:
        text = f.read()
    assert re.search(r"data_guardian\.py.{0,120}(verifies|prueft)", text, re.S | re.I), (
        "Der Satz, dass data_guardian.py die Dateien taeglich prueft, steht "
        "nicht mehr in data/_consumers.md. Dann pruefen die Zusicherungen "
        "oben eine Zusage, die niemand mehr gibt.")


# ─────────────────────────────────────────────────────────────────────
# DER SPALTENVERTRAG GEGEN DIE ECHTEN DATEIEN (12.09.2026)
# ─────────────────────────────────────────────────────────────────────

def _waechter():
    spec = importlib.util.spec_from_file_location("dg_vertrag2", WAECHTER)
    m = importlib.util.module_from_spec(spec)
    sys.modules["dg_vertrag2"] = m
    spec.loader.exec_module(m)
    return m


def test_jede_pflichtspalte_steht_wirklich_in_der_datei():
    """Keine erfundenen Spalten.

    Gelesen wird mit dem Trennzeichen, das im Vertrag steht — genau das
    fehlte bis zum 12.09.2026 und war der Grund, warum die vier
    semikolongetrennten online_api_*-Dateien ueberhaupt ohne Vertrag
    dastanden."""
    import csv
    m = _waechter()
    fehler = {}
    geprueft = 0
    for fn, spec in m.CONSUMERS.items():
        pflicht = spec.get("required") or []
        if not pflicht:
            continue
        pfad = os.path.join(WURZEL, "data", fn)
        if not os.path.exists(pfad):
            continue
        if not fn.endswith(".csv"):
            continue
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            kopf = csv.DictReader(f, delimiter=m.consumer_sep(fn)).fieldnames or []
        fehlt = [c for c in pflicht if c not in kopf]
        if fehlt:
            fehler[fn] = fehlt
        geprueft += 1
    assert geprueft >= 8, f"nur {geprueft} Dateien mit Vertrag geprueft — Vorpruefung"
    assert fehler == {}, (
        "Pflichtspalten, die es in der echten Datei nicht gibt "
        f"(Trennzeichen aus dem Vertrag): {fehler}")


def test_die_vier_online_api_dateien_haben_einen_spaltenvertrag():
    """Der eigentliche Befund: data/_consumers.md sagt taegliche
    Spaltenpruefung zu, CONSUMERS fuehrte fuer diese vier Dateien eine
    LEERE Pflichtliste — geprueft wurde damit nichts als ihr Dasein."""
    m = _waechter()
    fs = _format_schluessel()
    erwartet = ["online_api_tournaments.csv", "online_api_archetypes.csv",
                f"online_api_cards_{fs}.csv", f"online_api_matchups_{fs}.csv"]
    ohne = [fn for fn in erwartet
            if not (m.CONSUMERS.get(fn, {}).get("required"))]
    assert ohne == [], f"ohne Spaltenvertrag: {ohne}"
    falsches_trennzeichen = [fn for fn in erwartet
                             if m.consumer_sep(fn) != ";"]
    assert falsches_trennzeichen == [], (
        "diese Dateien sind semikolongetrennt; ohne `sep` liest der "
        f"Pruefer eine einzige Riesenspalte: {falsches_trennzeichen}")
    # Die Schluesselspalten, ohne die der Rest nicht zuzuordnen ist.
    for fn in erwartet:
        assert "tournament_id" in m.CONSUMERS[fn]["required"], fn
    assert "set" in m.CONSUMERS[f"online_api_cards_{fs}.csv"]["required"], (
        "`set` und `number` sind der Riegel, ueber den update_sets.py "
        "data/format_window.json weiterstellt — sie gehoeren in den Vertrag")
    assert "number" in m.CONSUMERS[f"online_api_cards_{fs}.csv"]["required"]


def test_der_waechter_meldet_zu_diesem_vertrag_nichts():
    """Der Vertrag muss gegen die HEUTIGEN Dateien sauber durchlaufen —
    sonst waere er nur eine Dauerwarnung."""
    m = _waechter()
    befunde = []
    m.check_schema(befunde)
    assert befunde == [], f"check_schema meldet: {befunde}"


# ─────────────────────────────────────────────────────────────────────
# has_decklists — die Kennzeichnung muss stehen bleiben
# ─────────────────────────────────────────────────────────────────────

SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "limitless_api_scraper.py")


def test_die_unzuverlaessige_spalte_ist_als_solche_gekennzeichnet():
    """`has_decklists` ist die Angabe der Quelle, nicht nachgeprueft.

    Gemessen 12.09.2026 ueber die echten Dateien: 1 Turnier mit
    has_decklists=False UND 816 Kartenzeilen, 210 leere Zellen, die
    "nicht gefragt" heissen (depth=archetypen). Solange die Spalte
    unveraendert weitergeschrieben wird, muss an BEIDEN Stellen stehen,
    dass man nicht danach filtern darf — im veroeffentlichten Vertrag
    und dort, wo sie entsteht."""
    with open(DOK, encoding="utf-8") as f:
        dok = f.read()
    with open(SCRAPER, encoding="utf-8") as f:
        code = f.read()
    # Zitatzeichen und Zeilenumbrueche raus, damit der Satz als Satz
    # gefunden wird und nicht als Markdown-Umbruch durchrutscht.
    flach = re.sub(r"\s*\n\s*>?\s*", " ", dok)
    assert re.search(r"has_decklists.{0,200}?do not filter", flach, re.I), (
        "data/_consumers.md warnt nicht mehr davor, auf has_decklists zu "
        "filtern — dann tut es der naechste Leser")
    assert re.search(r"(?i)nicht nachgeprueft|nicht nachgeprüft", code), (
        "backend/scrapers/limitless_api_scraper.py kennzeichnet "
        "has_decklists nicht mehr als unnachgeprueft")
    warnung = flach[flach.index("is the source's claim"):]
    assert "online_api_cards_" in warnung[:1200], (
        "die Warnung muss sagen, WIE man es stattdessen beantwortet: "
        "Kartenzeilen je tournament_id zaehlen")


def test_niemand_filtert_auf_has_decklists():
    """Die Gegenprobe zur Warnung: findet sich doch ein Filter, ist die
    Warnung zu spaet gekommen und der Befund echt."""
    import subprocess
    treffer = subprocess.run(
        ["grep", "-rn", "--include=*.py", "--include=*.js", "has_decklists",
         os.path.join(WURZEL, "backend"), os.path.join(WURZEL, "scripts"),
         os.path.join(WURZEL, "js"), os.path.join(WURZEL, "bot")],
        capture_output=True, text=True).stdout.splitlines()
    # Erlaubt: die Spaltenliste des Scrapers, die Zuweisung selbst und
    # Kommentarzeilen. Alles andere waere eine Auswertung.
    verdaechtig = [z for z in treffer
                   if not re.search(r"^\s*#", z.split(":", 2)[-1])
                   and '"has_decklists"' not in z.split(":", 2)[-1]]
    assert verdaechtig == [], (
        "has_decklists wird ausgewertet, obwohl es die Angabe der Quelle "
        f"ist: {verdaechtig}")
