"""Kartentexte in beiden Sprachen — und die zwei Loecher davor.

BEFUND (21.09.2026)
===================
Der Betreiber wollte deutsche Kartentexte. Beim Nachmessen kamen zwei
Fehler ans Licht, die mit der Sprache gar nichts zu tun hatten:

| gemessen in data/all_cards_database.csv | |
| --- | --- |
| Karten mit einem Faehigkeitsnamen | **0 von 20.580** |
| Nicht-Pokemon ohne jeden Kartentext | **3.208 von 3.210** |

1. Der Faehigkeitsname wurde in `.card-text-ability-name` gesucht — ein
   Element, das die Seite nicht hat. Limitless schreibt ihn in
   `.card-text-ability-info` hinter „Ability:".
2. Trainer, Items, Stadien, Werkzeuge und Spezialenergien fuehren ihren
   Text in einem KLASSENLOSEN `.card-text-section`, den der Parser
   uebersprungen hat.

Beide sind in backend/core/kartentext.py behoben, und beide werden hier
gegen ECHTE Kartenbloecke geprueft (tests/fixtures/, gemessen am
21.09.2026 — Herkunft und Kuerzung stehen im `_meta` der Datei).

Eine Textzusicherung haette hier nicht gereicht: geprueft werden muss,
was der Parser HERAUSHOLT, nicht welche Zeichenkette im Quelltext steht.
Deshalb laeuft er hier wirklich (CLAUDE.md, 12.09.2026).
"""

import csv
import importlib.util
import json
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
KERN = os.path.join(WURZEL, "backend", "core")
DATEN = os.path.join(WURZEL, "data")

sys.path.insert(0, KERN)

bs4 = pytest.importorskip("bs4")
from bs4 import BeautifulSoup  # noqa: E402


def _lade(name, pfad):
    spec = importlib.util.spec_from_file_location(name, pfad)
    modul = importlib.util.module_from_spec(spec)
    sys.modules[name] = modul
    spec.loader.exec_module(modul)
    return modul


kt = _lade("kartentext_test", os.path.join(KERN, "kartentext.py"))
pcd = _lade("pcd_test", os.path.join(KERN, "prepare_card_data.py"))


@pytest.fixture(scope="module")
def bloecke():
    pfad = os.path.join(WURZEL, "tests", "fixtures", "limitless_kartentext.json")
    with open(pfad, encoding="utf-8") as f:
        roh = json.load(f)
    return {k: BeautifulSoup(v, "lxml").select_one(".card-text")
            for k, v in roh.items() if not k.startswith("_")}


# ── Der Vorrat selbst ────────────────────────────────────────────────

def test_der_pruefvorrat_nennt_seine_herkunft():
    """Ohne Herkunft ist ein Vorrat erfunden, nicht gemessen."""
    pfad = os.path.join(WURZEL, "tests", "fixtures", "limitless_kartentext.json")
    with open(pfad, encoding="utf-8") as f:
        roh = json.load(f)
    meta = roh.get("_meta", {})
    assert meta.get("gemessen_am"), "kein Messdatum"
    assert len(meta.get("quelle") or []) >= 4, "keine Quell-Adressen"
    for u in meta["quelle"]:
        assert u.startswith("https://limitlesstcg.com/cards/"), u
    assert len([k for k in roh if not k.startswith("_")]) >= 4


# ── Fehler 1: der Faehigkeitsname ────────────────────────────────────

def test_der_faehigkeitsname_steht_im_text(bloecke):
    """Das Loch, das 20.580 Karten betraf."""
    text = kt.kartentext(bloecke["de|PBL|100"])
    assert "[Ability] Kollateraler Kopfstoß" in text, text[:200]


def test_der_faehigkeitsname_kommt_aus_info_nicht_aus_name(bloecke):
    """Gegenprobe zum eigentlichen Fehler.

    `.card-text-ability-name` gibt es auf der Seite nicht. Waere der
    Parser weiter darauf aus, faende er nichts — und genau das war der
    Zustand bis zum 21.09.2026.
    """
    block = bloecke["de|PBL|100"]
    assert block.select(".card-text-ability-name") == [], (
        "Die Quelle fuehrt dieses Element inzwischen doch — dann darf der "
        "Parser es benutzen, und diese Pruefung gehoert umgeschrieben.")
    assert block.select_one(".card-text-ability-info") is not None


def test_das_wort_ability_bleibt_nicht_im_namen_stehen():
    assert kt.faehigkeitsname("Ability: Schnarchergesicht") == "Schnarchergesicht"
    assert kt.faehigkeitsname("Poké-Power: Zeitsprung") == "Zeitsprung"
    assert kt.faehigkeitsname("Poké-Body: Panzer") == "Panzer"
    # Ohne Praefix bleibt der Text stehen — lieber vollstaendig als leer.
    assert kt.faehigkeitsname("Nur ein Name") == "Nur ein Name"


# ── Fehler 2: der Trainertext ────────────────────────────────────────

def test_ein_item_hat_ueberhaupt_einen_text(bloecke):
    """3.208 von 3.210 Nicht-Pokemon hatten bis zum 21.09.2026 keinen."""
    text = kt.kartentext(bloecke["de|SVI|196"])
    assert "Ablagestapel" in text, text[:200]
    assert "Durchsuche dein Deck" in text, text[:200]


def test_der_klassenlose_abschnitt_ist_der_richtige(bloecke):
    """Beweis, dass der Text wirklich dort und nirgends sonst steht."""
    block = bloecke["de|SVI|196"]
    assert block.select(".card-text-attack") == []
    assert block.select(".card-text-ability") == []
    frei = [a for a in block.select(".card-text-section")
            if list(a.get("class") or []) == ["card-text-section"]
            and not a.select_one(".card-text-title")]
    assert len(frei) == 1, [a.get("class") for a in block.select(".card-text-section")]


def test_der_kuenstlerabschnitt_landet_nicht_im_kartentext(bloecke):
    """Er traegt dieselbe Grundklasse und waere leicht mitgenommen."""
    text = kt.kartentext(bloecke["de|SVI|196"])
    assert "Illustrated by" not in text
    assert "Ayaka Yoshida" not in text


def test_eine_basisenergie_erzeugt_nichts(bloecke):
    """Ihr Abschnitt ist leer — daraus darf kein Text entstehen."""
    assert kt.kartentext(bloecke["de|SVE|1"]) == ""


# ── Die WRR-Zeile ────────────────────────────────────────────────────

def test_weakness_gehoert_in_den_englischen_text(bloecke):
    text = kt.kartentext(bloecke["de|PBL|100"], mit_wrr=True)
    assert "Weakness: Grass" in text
    assert text.split(kt.TRENNER)[-1].startswith("Weakness:"), (
        "die Zeile gehoert ans Ende, wie auf der Karte")


def test_und_nicht_in_den_deutschen(bloecke):
    """ENTSCHEIDUNG DES BETREIBERS (21.09.2026).

    Die Zeile ist auch auf der deutschen Seite englisch. Sie steht
    deshalb nicht im deutschen Text; die Oberflaeche zeigt die Werte aus
    dem englischen Feld mit den Typnamen, die die App ohnehin uebersetzt
    fuehrt. Nichts erfunden, kein englischer Satz mitten im deutschen
    Kartentext.
    """
    text = kt.kartentext(bloecke["de|PBL|100"], mit_wrr=False)
    assert "Weakness" not in text
    assert "Resistance" not in text
    assert "Retreat" not in text
    # Der Rest muss aber vollstaendig da sein.
    assert "[Ability] Kollateraler Kopfstoß" in text
    assert "Krawallhammer" in text


# ── Fehlende Uebersetzung ────────────────────────────────────────────

def test_eine_nicht_uebersetzte_karte_wird_erkannt(bloecke):
    """Gemessen an /cards/de/30C/120 am 21.09.2026.

    Die Quelle faellt NICHT still auf Englisch zurueck — sie liefert
    HTTP 200 mit leerem Namen, einem href auf /cards/en/ und der
    Platzhalter-Attacke „Attack 1".
    """
    assert kt.ist_uebersetzt(bloecke["de|30C|120"]) is False


def test_und_die_uebersetzten_werden_nicht_mit_aussortiert(bloecke):
    for k in ("de|PBL|100", "de|SVI|196", "de|SVE|1"):
        assert kt.ist_uebersetzt(bloecke[k]) is True, k


def test_der_platzhalterblock_traegt_wirklich_alle_drei_merkmale(bloecke):
    """Beleg, dass der Vorrat den Fall abbildet, den er abbilden soll."""
    block = bloecke["de|30C|120"]
    link = block.select_one(".card-text-name a")
    assert link.get_text(strip=True) == "", "Merkmal 1 (leerer Name) fehlt"
    assert "/cards/en/" in link.get("href"), "Merkmal 2 (href auf /en/) fehlt"
    attacken = [kt.attacke_ohne_beiwerk(
        re.sub(r"\s+", " ", el.get_text(" ", strip=True)))
        for el in block.select(".card-text-attack-info")]
    assert any(re.fullmatch(r"Attack \d+", a) for a in attacken), \
        f"Merkmal 3 (Platzhaltername) fehlt: {attacken}"


# JEDES MERKMAL EINZELN — und warum das hier stehen MUSS.
#
# Die Verfaelschungsprobe am 21.09.2026 hat es gezeigt: schaltet man in
# `ist_uebersetzt` NUR die Platzhalterpruefung aus (oder NUR die
# Namenspruefung), bleibt der Test oben gruen — die beiden anderen
# Merkmale fangen den einen Fall weiter ab. Damit waere jede einzelne
# Pruefung ungesichert, und wenn Limitless spaeter das eine Merkmal
# aendert, das als einziges noch traegt, laeuft englischer Text
# stillschweigend in die deutsche Spalte.
#
# Deshalb: drei gebaute Faelle, in denen jeweils GENAU EIN Merkmal
# zutrifft. Jeder muss fuer sich „nicht uebersetzt" ergeben.

def _block(html):
    return BeautifulSoup(html, "lxml").select_one(".card-text")


_RUMPF = ('<div class="card-text"><div class="card-text-section">'
          '<p class="card-text-title"><span class="card-text-name">'
          '<a href="{href}">{name}</a></span></p></div>'
          '<div class="card-text-section"><div class="card-text-attack">'
          '<p class="card-text-attack-info">C {attacke} 30</p>'
          '</div></div></div>')


def test_allein_der_leere_name_reicht_als_merkmal():
    b = _block(_RUMPF.format(href="/cards/de/XY/1", name="",
                             attacke="Donnerschock"))
    assert kt.ist_uebersetzt(b) is False


def test_allein_der_en_link_reicht_als_merkmal():
    b = _block(_RUMPF.format(href="/cards/en/XY/1", name="Pikachu",
                             attacke="Donnerschock"))
    assert kt.ist_uebersetzt(b) is False


def test_allein_die_platzhalterattacke_reicht_als_merkmal():
    b = _block(_RUMPF.format(href="/cards/de/XY/1", name="Pikachu",
                             attacke="Attack 1"))
    assert kt.ist_uebersetzt(b) is False


def test_und_ohne_jedes_merkmal_gilt_die_karte_als_uebersetzt():
    """Die Gegenrichtung — sonst waere alles „nicht uebersetzt" und die
    deutsche Spalte bliebe fuer immer leer."""
    b = _block(_RUMPF.format(href="/cards/de/XY/1", name="Pikachu",
                             attacke="Donnerschock"))
    assert kt.ist_uebersetzt(b) is True


def test_eine_attacke_die_zufaellig_attack_heisst_ist_kein_platzhalter():
    """„Attack 1" ist der Platzhalter, „Attack of the Clones" nicht.

    Ohne diese Grenze wuerde eine echte englischsprachige Attacke mit
    dem Wort „Attack" im Namen die ganze Karte aussortieren.
    """
    b = _block(_RUMPF.format(href="/cards/de/XY/1", name="Pikachu",
                             attacke="Attack Command"))
    assert kt.ist_uebersetzt(b) is True


def test_attacke_ohne_beiwerk():
    assert kt.attacke_ohne_beiwerk("FF Krawallhammer 150") == "Krawallhammer"
    assert kt.attacke_ohne_beiwerk("MMM Maximalbohrer 200+") == "Maximalbohrer"
    assert kt.attacke_ohne_beiwerk("0 Attack 1 30×") == "Attack 1"
    assert kt.attacke_ohne_beiwerk("G Lockendes Glühen") == "Lockendes Glühen"


# ── Der Schluessel ───────────────────────────────────────────────────

def test_der_schluessel_kommt_aus_beiden_sprachfassungen(bloecke):
    assert kt.kartenschluessel(bloecke["de|PBL|100"]) == "PBL|100"
    assert kt.kartenschluessel(bloecke["de|SVI|196"]) == "SVI|196"
    # Auch aus dem /cards/en/-Link der nicht uebersetzten Karte.
    assert kt.kartenschluessel(bloecke["de|30C|120"]) == "30C|120"


# ── Die Aera-Regel steht an EINER Stelle ─────────────────────────────

def test_die_aera_regel_wird_nicht_zweimal_gepflegt():
    """`aera_fuer_set` ist am 21.09.2026 aus dem Rumpf von
    `split_card_database_chunks` herausgezogen worden, damit der
    Kartentext-Scraper dieselbe Frage mit derselben Antwort beantwortet.

    Geprueft wird die AUSFUEHRUNG, nicht die Schreibweise: die Schwellen
    duerfen sich aendern, solange beide Seiten dieselbe Funktion rufen.
    """
    # load_set_order() sucht sets.json relativ zum Aufrufort und kommt
    # unter pytest leer zurueck — dann waere jedes Set "standard" und
    # die Pruefung eine Attrappe. Die echte Datei wird deshalb direkt
    # gelesen.
    with open(os.path.join(DATEN, "sets.json"), encoding="utf-8") as f:
        ordnung = json.load(f)
    assert ordnung.get("TEF"), "sets.json ohne Ordnungszahlen — nichts zu pruefen"
    assert pcd.aera_fuer_set("30C", ordnung) == "standard"
    assert pcd.aera_fuer_set("TEF", ordnung) == "standard"
    assert pcd.aera_fuer_set("SVP", ordnung) == "standard"   # Promo-Sonderweg
    # RCL ist das erste Extended-Set: sets.json fuehrt es auf 113, und
    # EXTENDED_MIN_ORDER steht auf 113. SSH liegt mit 112 knapp
    # darunter und ist Legacy — der Kommentar an der Konstanten hat das
    # am 21.09.2026 noch anders behauptet und ist mitkorrigiert worden.
    assert pcd.aera_fuer_set("RCL", ordnung) == "extended"
    assert pcd.aera_fuer_set("SSH", ordnung) == "legacy"
    assert pcd.aera_fuer_set("BS", ordnung) == "legacy"
    assert pcd.aera_fuer_set("M3", ordnung) == "ueberholt"


def test_der_kartentext_scraper_benutzt_genau_diese_funktion():
    quelle = open(os.path.join(WURZEL, "backend", "scrapers",
                               "scrape_kartentexte.py"), encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert "aera_fuer_set" in ohne, (
        "der Scraper entscheidet die Aera selbst statt sie zu erfragen — "
        "zwei Kopien derselben Schwelle laufen frueher oder spaeter auseinander")
    assert "STANDARD_MIN_ORDER" not in ohne, (
        "die Schwelle ist in den Scraper kopiert worden")


# ── Die Spalte ───────────────────────────────────────────────────────

def test_beide_kopfzeilen_des_kartenscrapers_kennen_die_spalte():
    """`all_cards_scraper.py` schreibt die CSV an ZWEI Stellen komplett
    neu. Fehlt die Spalte in einer der beiden Kopfzeilen, ist der
    deutsche Text nach dem naechsten Wochenlauf weg — still.
    """
    quelle = open(os.path.join(WURZEL, "backend", "scrapers",
                               "all_cards_scraper.py"), encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    kopfzeilen = re.findall(r'fieldnames\s*=\s*\[(.*?)\]', ohne, flags=re.S)
    assert len(kopfzeilen) == 2, f"{len(kopfzeilen)} Kopfzeilen gefunden"
    for k in kopfzeilen:
        assert '"card_text_de"' in k, k.strip()[:160]


def test_der_kartenscraper_ruft_die_gemeinsame_extraktion():
    """Und baut sie nicht noch einmal nach — mit demselben Fehler."""
    quelle = open(os.path.join(WURZEL, "backend", "scrapers",
                               "all_cards_scraper.py"), encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert "from kartentext import kartentext" in ohne
    assert "card-text-ability-name" not in ohne, (
        "der Selektor, den es auf der Seite nie gab, ist zurueck")


def test_die_spalte_steht_in_der_ausgelieferten_datei():
    """Die Kopfzeile der echten Datei — nicht nur die im Code."""
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        kopf = next(csv.reader(f))
    assert kopf[-1] == "card_text_de", kopf
    # Anhaengen ist erlaubt, Umsortieren nicht (data/_consumers.md).
    assert kopf[:13] == ["name_en", "name_de", "set", "number", "type",
                         "energy_type", "hp", "rarity", "image_url",
                         "international_prints", "jp_prints",
                         "cardmarket_url", "card_text"], kopf


# ── Der deutsche Text bleibt aus dem Legacy-Chunk heraus ─────────────

def test_legacy_bekommt_keinen_deutschen_text(tmp_path):
    """Ausgefuehrt, nicht behauptet.

    Ohne diese Regel reicht der Chunker JEDES Feld durch — er kennt
    keine Feldauswahl. cards_chunk_legacy.json waere um rund 1,6 MB
    groesser, fuer einen Text, den 40 % der Karten dort gar nicht haben
    (gemessene DE-Abdeckung Legacy: 60,4 %).
    """
    karten = [
        {"set": "30C", "number": "1", "card_text": "EN", "card_text_de": "DE"},
        {"set": "RCL", "number": "1", "card_text": "EN", "card_text_de": "DE"},
        {"set": "BS",  "number": "1", "card_text": "EN", "card_text_de": "DE"},
    ]
    # Ohne echte Ordnungszahlen haelt der Chunker jedes Set fuer eine
    # frische Rotation und schiebt alles in den Standard — die Pruefung
    # wuerde dann gruen laufen, ohne je einen Legacy-Fall zu sehen.
    with open(os.path.join(DATEN, "sets.json"), encoding="utf-8") as f:
        ordnung = json.load(f)
    pcd.load_set_order = lambda: ordnung
    pcd.split_card_database_chunks(karten, str(tmp_path))
    gelesen = {}
    for name in ("standard", "extended", "legacy"):
        with open(tmp_path / f"cards_chunk_{name}.json", encoding="utf-8") as f:
            gelesen[name] = json.load(f)

    assert [c["set"] for c in gelesen["standard"]] == ["30C"]
    assert [c["set"] for c in gelesen["extended"]] == ["RCL"]
    assert [c["set"] for c in gelesen["legacy"]] == ["BS"]

    assert gelesen["standard"][0].get("card_text_de") == "DE"
    assert gelesen["extended"][0].get("card_text_de") == "DE"
    assert "card_text_de" not in gelesen["legacy"][0], (
        "der deutsche Text ist im Legacy-Chunk gelandet")
    # Der englische bleibt ueberall — er ist dort vollstaendig.
    assert gelesen["legacy"][0]["card_text"] == "EN"


# ── Die Luecke ist benannt und datiert, nicht stillschweigend ────────
#
# CLAUDE.md, 13.09.2026: „wo eine Luecke geduldet wird, wird sie BENANNT
# und DATIERT — in den Daten, nicht im Testcode —, und die Liste wird in
# BEIDE Richtungen geprueft."
#
# Die Lage am 21.09.2026: die Spalte `card_text_de` ist angelegt, aber
# leer. Fuellen kann sie nur CI, weil die Sandkiste limitlesstcg.com
# nicht erreicht. Eine Zusicherung „die Spalte ist gefuellt" waere
# deshalb jetzt rot und muesste abgeschaltet werden — und abgeschaltete
# Zusicherungen bleiben abgeschaltet.
#
# Stattdessen haengt sie an ihrem BELEG: sobald
# data/kartentext_stand.json existiert, hat ein Lauf stattgefunden, und
# dann muss die Datenbank genau das enthalten, was er berichtet. Die
# Pruefung wird von selbst scharf und kann nicht vergessen werden.

def _stand():
    pfad = os.path.join(DATEN, "kartentext_stand.json")
    if not os.path.isfile(pfad):
        return None
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def test_ohne_lauf_ist_die_spalte_leer_und_das_ist_der_bekannte_zustand():
    """Die eine Richtung: keine Standdatei, also noch kein Lauf.

    Diese Pruefung faellt weg, sobald der erste Lauf durch ist — sie ist
    dann durch die naechste ersetzt. Bis dahin haelt sie fest, dass der
    leere Zustand BEKANNT ist und nicht uebersehen wurde.
    """
    if _stand() is not None:
        pytest.skip("Ein Lauf hat stattgefunden — es gilt die Pruefung darunter.")
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        gefuellt = sum(1 for r in csv.DictReader(f)
                       if (r.get("card_text_de") or "").strip())
    assert gefuellt == 0, (
        f"{gefuellt} Karten tragen deutschen Text, aber es gibt keine "
        "data/kartentext_stand.json. Entweder ist die Standdatei verloren "
        "gegangen, oder jemand hat die Spalte von Hand gefuellt — beides "
        "gehoert angesehen.")


def test_nach_einem_lauf_deckt_sich_der_bericht_mit_den_daten():
    """Die andere Richtung: was der Lauf berichtet, muss drinstehen.

    Ein Bericht, den niemand gegen die Daten haelt, ist eine Behauptung.
    """
    stand = _stand()
    if stand is None:
        pytest.skip("Noch kein Lauf — es gilt die Pruefung darueber.")

    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        zeilen = list(csv.DictReader(f))

    sets = set(stand["sets"])
    betrachtet = [r for r in zeilen if (r.get("set") or "").strip() in sets]
    mit_de = [r for r in betrachtet if (r.get("card_text_de") or "").strip()]

    assert len(betrachtet) == stand["karten_betrachtet"], (
        "Der Bericht spricht von {} Karten, die Datenbank fuehrt {} in "
        "denselben Sets.".format(stand["karten_betrachtet"], len(betrachtet)))
    assert len(mit_de) == stand["mit_text_de"], (
        "Der Bericht meldet {} Karten mit deutschem Text, gezaehlt sind "
        "{}.".format(stand["mit_text_de"], len(mit_de)))

    # Und die gemeldeten Luecken sind wirklich Luecken — sonst ist die
    # Liste ein Friedhof (CLAUDE.md, 13.09.2026).
    nach_schluessel = {
        "{}|{}".format((r.get("set") or "").strip().upper(),
                       (r.get("number") or "").strip()): r for r in zeilen}
    for schluessel in stand.get("ohne_deutsche_fassung") or []:
        zeile = nach_schluessel.get(schluessel)
        assert zeile is not None, f"{schluessel} steht im Bericht, aber nicht in der Datenbank"
        assert not (zeile.get("card_text_de") or "").strip(), (
            f"{schluessel} gilt laut Bericht als nicht uebersetzt, traegt "
            "aber deutschen Text — die Liste gehoert gekuerzt")


def test_ein_deutscher_text_traegt_nie_die_englische_wrr_zeile():
    """Gegen die Daten, nicht gegen den Code.

    Die Entscheidung vom 21.09.2026 ist eine Aussage ueber das, was im
    Browser steht. Sie gehoert deshalb gegen die ausgelieferte Datei
    geprueft und nicht nur gegen die Funktion, die sie erzeugt.
    """
    if _stand() is None:
        pytest.skip("Noch kein Lauf.")
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        treffer = [f"{r['set']}-{r['number']}" for r in csv.DictReader(f)
                   if "Weakness:" in (r.get("card_text_de") or "")]
    assert treffer == [], (
        f"{len(treffer)} deutsche Kartentexte tragen die englische "
        f"WRR-Zeile: {treffer[:10]}")


# ── Die Aera-Auswahl muss wirklich auswaehlen ────────────────────────
#
# BEFUND AUS LAUF #1 (21.09.2026): der Lauf hat **alle 154 Sets** geholt
# statt der 47 aus Standard und Extended — 308 Abrufe statt 94.
#
# Ursache: `load_set_order()` aus card_scraper_shared sucht sets.json
# relativ zum Aufrufort und kam im Scraper leer zurueck. Eine leere
# Ordnung heisst fuer `aera_fuer_set`, dass jedes Set eine frische
# Rotation ist — und frische Rotationen gehen in den Standard.
#
# Das Tueckische: es sah nach Erfolg aus. Mehr Daten als bestellt faellt
# nicht auf, nur die Laufzeit war doppelt so lang. Genau deshalb steht
# die Pruefung hier und nicht im Kopf des Betreibers.

def test_der_scraper_liest_die_ordnungszahlen_selbst():
    """Ausgefuehrt: die Datei muss wirklich Zahlen hergeben."""
    sk = _lade("sk_test", os.path.join(WURZEL, "backend", "scrapers",
                                       "scrape_kartentexte.py"))
    ordnung = sk.set_ordnung()
    assert len(ordnung) > 100, f"nur {len(ordnung)} Ordnungszahlen"
    assert ordnung.get("TEF"), "TEF fehlt — dann ist die Datei unbrauchbar"


def test_eine_eingeschraenkte_auswahl_ist_kleiner_als_alles():
    """Der Fehler aus Lauf #1, gegen die echten Daten.

    Geprueft wird die AUSWAHL, nicht ihre Schreibweise: wie viele Sets
    bleiben uebrig, wenn nur Standard und Extended gewuenscht sind?
    """
    import csv as _csv
    sk = _lade("sk_test2", os.path.join(WURZEL, "backend", "scrapers",
                                        "scrape_kartentexte.py"))
    ordnung = sk.set_ordnung()
    aera = pcd.aera_fuer_set

    alle = set()
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        for r in _csv.DictReader(f):
            s = (r.get("set") or "").strip()
            if s:
                alle.add(s)

    gewaehlt = {s for s in alle if aera(s, ordnung) in {"standard", "extended"}}
    assert gewaehlt, "keine Sets ausgewaehlt"
    assert len(gewaehlt) < len(alle), (
        f"Standard+Extended waehlt alle {len(alle)} Sets aus. Die "
        "Einordnung greift nicht — genau der Fehler aus Lauf #1.")
    # Und die Groessenordnung stimmt: gemessen am 21.09.2026 sind es 47
    # von 154. Die Form ist bewusst eine Spanne, keine Gleichheit — ein
    # neues Set darf dazukommen, ohne dass diese Datei rot wird.
    assert 30 <= len(gewaehlt) <= 80, (
        f"{len(gewaehlt)} von {len(alle)} Sets gewaehlt — am 21.09.2026 "
        "waren es 47. Eine Abweichung dieser Groesse heisst, dass sich "
        "die Einordnung verschoben hat.")
    # Gegenprobe: ein bekanntes Legacy-Set darf NICHT dabei sein.
    assert "BS" not in gewaehlt, "Base Set gilt als Standard oder Extended"


def test_der_ausgelieferte_legacy_chunk_traegt_keinen_deutschen_text():
    """Gegen die ECHTE Datei, nicht gegen einen gebauten Fall.

    NACHTRAG 21.09.2026: Lauf #1 hat wegen des Auswahlfehlers oben auch
    Legacy-Karten mit deutschem Text gefuellt. Die Texte sind richtig
    und bleiben in der CSV stehen — ein Verlust wird in diesem Repo
    nicht stillschweigend weggeworfen (CLAUDE.md, 13.09.2026).

    Entscheidend ist, was AUSGELIEFERT wird: der Legacy-Chunk waere
    sonst um rund 1,6 MB groesser, fuer einen Text, den 46 % der Karten
    dort nicht haben. Genau das prueft diese Zusicherung — an der Datei,
    die der Browser laedt.
    """
    pfad = os.path.join(DATEN, "cards_chunk_legacy.json")
    if not os.path.isfile(pfad):
        pytest.skip("Chunk noch nicht gebaut.")
    with open(pfad, encoding="utf-8") as f:
        karten = json.load(f)
    mit = [f"{c.get('set')}-{c.get('number')}" for c in karten
           if (c.get("card_text_de") or "").strip()]
    assert mit == [], (
        f"{len(mit)} Karten im Legacy-Chunk tragen deutschen Text: "
        f"{mit[:10]}")
    # Gegenprobe: im Standard-Chunk MUSS welcher stehen, sonst prueft
    # die Zeile oben nur, dass die Spalte ueberall fehlt.
    std = os.path.join(DATEN, "cards_chunk_standard.json")
    with open(std, encoding="utf-8") as f:
        s_karten = json.load(f)
    s_mit = sum(1 for c in s_karten if (c.get("card_text_de") or "").strip())
    assert s_mit > 1000, (
        f"nur {s_mit} Karten im Standard-Chunk mit deutschem Text — dann "
        "ist die Spalte ueberall verlorengegangen, nicht nur in Legacy")


def test_eine_leere_ordnung_bricht_ab_statt_alles_zu_holen(tmp_path):
    """Der gebaute Fall zum Fehler aus Lauf #1.

    Die Zusicherung darueber prueft, dass die echte sets.json Zahlen
    hergibt — sie kann aber nicht zeigen, was bei einer LEEREN Datei
    passiert. Genau das war der Fehler: ein leeres Ergebnis wurde
    geduldet und fuehrte dazu, dass jedes Set als frische Rotation galt.
    Ohne diesen Fall bliebe die Verfaelschungsprobe blind (gemessen).
    """
    sk = _lade("sk_test3", os.path.join(WURZEL, "backend", "scrapers",
                                        "scrape_kartentexte.py"))
    with open(tmp_path / "sets.json", "w", encoding="utf-8") as f:
        json.dump({}, f)
    sk.DATEN = str(tmp_path)
    with pytest.raises(RuntimeError) as fehler:
        sk.set_ordnung()
    assert "Ordnungszahlen" in str(fehler.value)

    # Und die Gegenrichtung: mit Zahlen geht es durch.
    with open(tmp_path / "sets.json", "w", encoding="utf-8") as f:
        json.dump({"TEF": 138}, f)
    assert sk.set_ordnung() == {"TEF": 138}


# ── Die Chunks muessen drei Chunks bleiben ───────────────────────────
#
# BEFUND (21.09.2026, nach Lauf #2): cards_chunk_standard.json trug
# **alle 21.076 Karten und 19,87 MB** statt 5.101 und 3,79 MB; extended
# und legacy waren LEER. Jeder Seitenaufruf haette das Fuenffache
# geladen.
#
# Ursache war wieder die leere Set-Ordnung: `prepare_card_data` liest
# sets.json aus backend/core/data/, mein Ablauf hat sie dorthin nicht
# gespiegelt, und ohne Ordnungszahlen gilt jedes Set als frische
# Rotation — frische Rotationen gehen in den Standard.
#
# Das Tueckische ist dasselbe wie bei der Aera-Auswahl: formal war jede
# Datei gueltig, kein Schritt meldete einen Fehler, und die Zahlen sieht
# nur, wer sie misst. Deshalb steht die Messung jetzt hier UND im
# Ablauf — im Ablauf, damit gar nicht erst committet wird; hier, damit
# ein entarteter Stand nicht durch die Suiten rutscht.

def test_die_chunks_sind_wirklich_drei():
    pfade = {n: os.path.join(DATEN, f"cards_chunk_{n}.json")
             for n in ("standard", "extended", "legacy")}
    if not all(os.path.isfile(p) for p in pfade.values()):
        pytest.skip("Chunks noch nicht gebaut.")
    groessen = {}
    for n, p in pfade.items():
        with open(p, encoding="utf-8") as f:
            groessen[n] = len(json.load(f))
    gesamt = sum(groessen.values())
    assert gesamt > 15000, f"nur {gesamt} Karten in den Chunks — {groessen}"
    for n in ("extended", "legacy"):
        assert groessen[n] > 0, (
            f"der {n}-Chunk ist leer, {groessen} — die Set-Ordnung hat "
            "nicht gegriffen")
    assert groessen["standard"] < 0.5 * gesamt, (
        f"der Standard-Chunk traegt {groessen['standard']} von {gesamt} "
        f"Karten ({groessen}). Er wird bei JEDEM Seitenaufruf geladen; "
        "am 21.09.2026 waren es dadurch 19,87 MB statt 3,79 MB.")


# ═════════════════════════════════════════════════════════════════════
#
# DER WOCHENLAUF HAETTE DEN DEUTSCHEN TEXT VERNICHTET (21.09.2026)
# ================================================================
# Nach dem Ausliefern gefragt: „ist alles im Weekly Full drin?" Beim
# Nachrechnen der Kette kamen ZWEI Loecher heraus, beide unsichtbar,
# beide mit demselben Ergebnis — `card_text_de` waere beim naechsten
# Dienstag leer gewesen.
#
# Die Kette im Wochenlauf:
#
#   1. Seed          data/  ->  backend/core/data/
#   2. all_cards_scraper   liest core/data/, schreibt core/data/
#   3. scrape_kartentexte  liest data/,      schreibt data/
#   4. prepare_card_data   liest core/data/, baut die Chunks
#   5. SYNC_PATTERNS       core/data/  ->  data/   (schreibt zurueck!)
#
# LOCH A, Schritt 2: `load_existing_cards` baut ein Kartenobjekt aus
# einer FELD-WEISSEN LISTE, und die Schreibfunktionen fuellen fehlende
# Schluessel mit ''. `card_text_de` stand nicht darin. Ausgefuehrt
# gemessen mit genau einer Zeile: card_text kam zurueck, card_text_de
# als None. Derselbe Fehler, den der Kommentar an `jp_prints` seit der
# gemessenen 464->334-Schwingung beschreibt.
#
# LOCH B, Schritte 3 bis 5: der Kartentext-Scraper schrieb nur nach
# `data/`. Schritt 4 liest aber `core/data/` — die Chunks haetten
# keinen deutschen Text bekommen — und Schritt 5 spiegelt `core/data/`
# zurueck nach `data/` und haette den frisch geholten Text ueberschrieben.
#
# Keines der beiden faellt im Betrieb auf: jede Datei bleibt gueltig,
# kein Schritt meldet etwas, und alle Suiten waren gruen.

def test_der_kartenscraper_reicht_den_deutschen_text_durch(tmp_path):
    """LOCH A, ausgefuehrt.

    Eine Textzusicherung reicht hier nicht: geprueft werden muss, was
    aus `load_existing_cards` HERAUSKOMMT, nicht welche Zeile im
    Quelltext steht.
    """
    acs = _lade("acs_test", os.path.join(WURZEL, "backend", "scrapers",
                                         "all_cards_scraper.py"))
    spalten = ["name_en", "name_de", "set", "number", "type", "energy_type",
               "hp", "rarity", "image_url", "international_prints",
               "jp_prints", "cardmarket_url", "card_text", "card_text_de"]
    zeile = {k: "" for k in spalten}
    zeile.update({
        "name_en": "Mega Excadrill ex", "name_de": "Mega-Stalobor-ex",
        "set": "PBL", "number": "65", "type": "Stage 1",
        "energy_type": "Metal", "hp": "340", "rarity": "Double Rare",
        "image_url": "http://beispiel/x.png",
        "international_prints": "PBL-65", "cardmarket_url": "http://cm/x",
        "card_text": "MM Undermine 90",
        "card_text_de": "MM Untergraben 90",
    })
    pfad = tmp_path / "all_cards_database.csv"
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=spalten)
        w.writeheader()
        w.writerow(zeile)

    erg = acs.load_existing_cards(str(pfad))
    karten = erg[0] if isinstance(erg, tuple) else erg
    assert karten, "keine Karte eingelesen"
    k = karten[0]
    assert k.get("card_text") == "MM Undermine 90", "schon der englische fehlt"
    assert k.get("card_text_de") == "MM Untergraben 90", (
        "card_text_de faellt aus der Feld-Weissen-Liste von "
        "load_existing_cards. Die Schreibfunktionen fuellen fehlende "
        "Schluessel mit '' — jeder Wochenlauf wuerde die Spalte fuer alle "
        "20.580 Karten leeren, genau wie es jp_prints einmal passiert ist.")


def test_der_kartentext_scraper_bedient_beide_datenordner():
    """LOCH B, an der Schreibstelle.

    Geprueft wird der Quelltext, weil ein echter Lauf ins Netz geht —
    aber gezielt: die Schreibschleife MUSS mehr als einen Zielpfad
    kennen, und `backend/core/data` muss einer davon sein. Kommentare
    werden vorher geschnitten, sonst faengt das Muster die Erklaerung
    darueber mit (CLAUDE.md, 13./14.09.2026).
    """
    quelle = open(os.path.join(WURZEL, "backend", "scrapers",
                               "scrape_kartentexte.py"), encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert "for ziel in ziele:" in ohne, (
        "es wird nur an EINEN Ort geschrieben — dann liest prepare_card_data "
        "die alte Fassung und der Rueckspiegel loescht den neuen Text")
    assert re.search(r"os\.path\.join\(KERN,\s*'data'", ohne), (
        "backend/core/data ist kein Ziel der Schreibschleife")


def test_die_beiden_spiegellisten_kennen_die_kartendatenbank():
    """Schritt 1 und Schritt 5 muessen dieselbe Datei fuehren.

    Der Wochenlauf sagt es selbst: „prepare_card_data.SYNC_PATTERNS is
    the matching write-back list — keep the two in lockstep." Steht die
    Kartendatenbank nur in einer der beiden, laeuft der deutsche Text in
    genau eine Richtung verloren.
    """
    lauf = open(os.path.join(WURZEL, ".github", "workflows",
                             "weekly-full-update.yml"), encoding="utf-8").read()
    pcd_quelle = open(os.path.join(KERN, "prepare_card_data.py"),
                      encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", pcd_quelle, flags=re.M)
    assert len(ohne) > len(pcd_quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"

    saat = re.search(r"Seed backend/core/data/ from data/(.{0,2200})", lauf, re.S)
    assert saat, "der Seed-Schritt heisst nicht mehr so"
    assert "all_cards_database.csv" in saat.group(1), (
        "die Kartendatenbank wird nicht mehr geseedet — dann liest "
        "all_cards_scraper einen leeren Bestand")

    muster = re.search(r"SYNC_PATTERNS\s*=\s*\[(.*?)\n\]", ohne, re.S)
    assert muster, "SYNC_PATTERNS nicht gefunden"
    assert '"all_cards_database.csv"' in muster.group(1), (
        "die Kartendatenbank steht nicht mehr in SYNC_PATTERNS")


# ── Kein Platzhalter darf als deutscher Text durchgehen ──────────────
#
# BEFUND 21.09.2026, beim Nachmessen des Datenstands: 29 Karten trugen
# „Attack 1" als deutschen Attackennamen — CRE-154, SMP-3, SMP-29,
# SMP-194 und fuenfzehn SP-Promos.
#
# Die Erkennung lief auf dem Text NACH dem Abschneiden des Schadens.
# Bei „0 Attack 1 30×" fiel dabei nur die 30× weg und „Attack 1" traf.
# Bei „C Attack 1" — Platzhalter ohne Schaden — frass dieselbe Regel die
# 1 als Schaden, uebrig blieb „Attack", und das Muster verlangte eine
# Ziffer. Die Karte galt als uebersetzt.
#
# Die Zahl gehoert zum Platzhalter, nicht zum Schaden.

_PLATZHALTER_PRUEFUNG = re.compile(
    r'^(?:Attack|Ability)\s+\d+(?:\s+\d+\s*[+×x*]?)?$', re.I)
_SYMBOLE = re.compile(r'^[A-Z0-9]+\s+')


def _traegt_platzhalter(text):
    for teil in (text or "").split(" || "):
        if _PLATZHALTER_PRUEFUNG.match(_SYMBOLE.sub("", teil).strip()):
            return True
    return False


def test_beide_platzhalterformen_werden_erkannt():
    """Mit Schaden und ohne — die zweite Form war das Loch."""
    def block(attacke):
        roh = ('<div class="card-text"><div class="card-text-section">'
               '<p class="card-text-title"><span class="card-text-name">'
               '<a href="/cards/de/X/1">Bauz</a></span></p></div>'
               '<div class="card-text-section"><div class="card-text-attack">'
               f'<p class="card-text-attack-info">{attacke}</p>'
               '</div></div></div>')
        return BeautifulSoup(roh, "lxml").select_one(".card-text")

    for a in ("C Attack 1", "0 Attack 1 30×", "RCC Attack 1", "C Attack 2"):
        assert kt.ist_uebersetzt(block(a)) is False, a
    # Gegenrichtung: echte Attacken bleiben drin, mit und ohne Schaden.
    for a in ("G Lockendes Glühen", "FF Krawallhammer 150",
              "MMM Maximalbohrer 200+"):
        assert kt.ist_uebersetzt(block(a)) is True, a


def test_kein_ausgelieferter_deutscher_text_traegt_einen_platzhalter():
    """Gegen die echte Datei — dort sind die 29 aufgefallen."""
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        treffer = [f"{r['set']}-{r['number']}" for r in csv.DictReader(f)
                   if _traegt_platzhalter(r.get("card_text_de"))]
    assert treffer == [], (
        f"{len(treffer)} deutsche Kartentexte tragen einen Platzhalter "
        f"statt eines Attackennamens: {treffer[:10]}")


def test_und_auch_nicht_in_den_ausgelieferten_chunks():
    """Was im Browser landet, zaehlt."""
    for name in ("standard", "extended"):
        pfad = os.path.join(DATEN, f"cards_chunk_{name}.json")
        if not os.path.isfile(pfad):
            pytest.skip("Chunks noch nicht gebaut.")
        with open(pfad, encoding="utf-8") as f:
            karten = json.load(f)
        treffer = [f"{c.get('set')}-{c.get('number')}" for c in karten
                   if _traegt_platzhalter(c.get("card_text_de"))]
        assert treffer == [], f"{name}: {treffer[:8]}"


# ── Der Bericht muss die Frage beantworten, fuer die es ihn gibt ─────
#
# BEFUND 21.09.2026: nach einem gezielten Lauf (`--sets BWP,DCR,…`)
# stand in der Standdatei nur noch, was DIESER Lauf angefasst hat —
# sieben Sets, 799 Karten. Wie vollstaendig Standard und Extended sind,
# war daraus nicht mehr zu lesen. Genau das ist aber die Frage, fuer die
# es die Datei gibt.
#
# `gesamtstand` zaehlt deshalb ueber die Datenbank, nicht ueber den Lauf.

def test_der_bericht_fuehrt_einen_gesamtstand():
    stand = _stand()
    if stand is None:
        pytest.skip("Noch kein Lauf.")
    g = stand.get("gesamtstand")
    assert g, (
        "der Bericht fuehrt keinen Gesamtstand — nach einem gezielten "
        "Lauf ist dann nicht mehr zu erkennen, wie vollstaendig die "
        "Kartentexte sind")
    for a in ("standard", "extended"):
        assert a in g, f"{a} fehlt im Gesamtstand"
        assert g[a]["karten"] > 1000, f"{a}: {g[a]}"
        assert 0 <= g[a]["anteil_de"] <= 100


def test_der_gesamtstand_deckt_sich_mit_der_datenbank():
    """Ein Bericht, den niemand gegen die Daten haelt, ist eine
    Behauptung — dieselbe Regel wie beim Lauf-Bericht darueber."""
    stand = _stand()
    if stand is None or not stand.get("gesamtstand"):
        pytest.skip("Noch kein Gesamtstand.")
    with open(os.path.join(DATEN, "sets.json"), encoding="utf-8") as f:
        ordnung = json.load(f)
    gezaehlt = {}
    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            a = pcd.aera_fuer_set((r.get("set") or "").strip(), ordnung)
            e = gezaehlt.setdefault(a, {"karten": 0, "mit_text_de": 0})
            e["karten"] += 1
            if (r.get("card_text_de") or "").strip():
                e["mit_text_de"] += 1

    for a, e in stand["gesamtstand"].items():
        assert a in gezaehlt, f"{a} steht im Bericht, nicht in den Daten"
        assert e["karten"] == gezaehlt[a]["karten"], (
            f"{a}: Bericht {e['karten']} Karten, gezaehlt "
            f"{gezaehlt[a]['karten']}")
        assert e["mit_text_de"] == gezaehlt[a]["mit_text_de"], (
            f"{a}: Bericht {e['mit_text_de']} mit deutschem Text, gezaehlt "
            f"{gezaehlt[a]['mit_text_de']}")


def test_der_scraper_schreibt_den_gesamtstand_auch_kuenftig():
    """Die beiden Pruefungen darueber lesen die DATEI.

    Nimmt jemand den Gesamtstand aus dem Scraper heraus, bleiben sie
    gruen, bis der naechste Lauf die Datei ohne ihn neu schreibt — und
    dann ist er weg, ohne dass es jemand gemerkt hat. Gemessen: beide
    Verfaelschungsproben am Scraper blieben blind.

    Deshalb hier zusaetzlich der Quelltext, mit Kommentarschnitt und
    Gegenprobe (CLAUDE.md, 13./14.09.2026).
    """
    quelle = open(os.path.join(WURZEL, "backend", "scrapers",
                               "scrape_kartentexte.py"), encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert "'gesamtstand': alle_aeren," in ohne, (
        "der Scraper schreibt keinen Gesamtstand mehr in die Standdatei")
    # Und er muss ueber ALLE Karten zaehlen, nicht ueber die des Laufs.
    assert re.search(r"for k in karten:\s*\n\s*a = aera_fuer_set", ohne), (
        "der Gesamtstand zaehlt nicht mehr ueber die ganze Datenbank")


# ---------------------------------------------------------------------------
# DER TEILVERLUST — was `tote_spalten()` NICHT sieht
#
# Gegen einen VOLLSTAENDIGEN Verlust der Spalte schlaegt der Waechter an:
# eine Pflichtspalte, die in JEDER Zeile leer ist, ist dort ein CRITICAL.
#
# Gegen einen TEILVERLUST schlug bis zum 21.09.2026 nichts an. Faellt ein
# Set, eine Aera oder ein Abrufblock aus, sinkt die Zahl — und jede
# einzelne Datei bleibt formal gueltig. Genau so sahen die beiden Loecher
# aus, die an diesem Tag gefunden wurden: kein Schritt meldete einen
# Fehler, alle Suiten waren gruen.
#
# data/kartentext_stand.json beantwortet die Frage nicht, denn der Lauf,
# der die Spalte leert, schreibt im selben Zug auch den Bericht neu. Ein
# Beleg, der sich mit dem Schaden mitbewegt, ist keiner.
# ---------------------------------------------------------------------------

def _waechter():
    return _lade("dg_kartentext",
                 os.path.join(WURZEL, "scripts", "data_guardian.py"))


def test_der_waechter_zaehlt_den_deutschen_kartentext():
    dg = _waechter()
    gezaehlt = dg.kartentext_de_gefuellt()
    assert gezaehlt is not None, (
        "der Waechter kann den Fuellstand von card_text_de nicht messen — "
        "fehlt die Datei oder die Spalte?")

    with open(os.path.join(DATEN, "all_cards_database.csv"),
              encoding="utf-8-sig") as f:
        eigen = sum(1 for r in csv.DictReader(f)
                    if (r.get("card_text_de") or "").strip())
    assert gezaehlt == eigen, (
        f"der Waechter zaehlt {gezaehlt}, die Datei traegt {eigen}")


def test_ein_verlust_ist_ein_fehler_ein_zuwachs_nicht():
    """Die Richtung IST die Aussage (CLAUDE.md, 12.09.2026).

    `== n` und `<= n` waeren beide falsch: Limitless uebersetzt laufend
    nach, und eine Form, die bei Zuwachs bricht, wird nach der dritten
    Woche von Hand hochgesetzt und ist dann keine Sicherung mehr.
    """
    dg = _waechter()

    verlust = []
    dg.check_kartentext_de_verlust(verlust, 14_000, 14_617)
    assert [s for s, _ in verlust] == ["CRITICAL"], (
        "ein Verlust von 617 Zeilen deutschem Kartentext ist kein CRITICAL")
    assert "card_text_de" in verlust[0][1], (
        "die Meldung nennt die Spalte nicht, die verloren ging")

    zuwachs = []
    dg.check_kartentext_de_verlust(zuwachs, 14_900, 14_617)
    assert [s for s, _ in zuwachs] == ["INFO"], (
        "Zuwachs darf niemanden wecken — die Quelle uebersetzt nach")

    gleich = []
    dg.check_kartentext_de_verlust(gleich, 14_617, 14_617)
    assert gleich == [], "unveraendert ist kein Befund"

    # Ohne Grundlinie (erster Lauf nach dem Ausliefern) keine Aussage —
    # und vor allem kein falscher Alarm.
    ohne = []
    dg.check_kartentext_de_verlust(ohne, 14_617, None)
    dg.check_kartentext_de_verlust(ohne, None, 14_617)
    assert ohne == [], "ohne Grundlinie darf nichts gemeldet werden"


def test_der_waechter_schreibt_den_fuellstand_in_die_grundlinie():
    """Sonst wird die Pruefung nie scharf.

    Sie vergleicht gegen `baseline['kartentext_de_gefuellt']`. Steht der
    Schluessel nicht in der Datei, die `--update-baseline` schreibt, ist
    `base` bei JEDEM Lauf None — die Pruefung waere dauerhaft stumm und
    niemand wuerde es merken. Das ist dieselbe Falle wie eine
    abgeschaltete Zusicherung, nur unsichtbar.
    """
    quelle = open(os.path.join(WURZEL, "scripts", "data_guardian.py"),
                  encoding="utf-8").read()
    ohne = re.sub(r"^\s*#.*$", "", quelle, flags=re.M)
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"
    assert '"kartentext_de_gefuellt": kartentext_de,' in ohne, (
        "der Fuellstand wird nicht in die Grundlinie geschrieben — "
        "die Pruefung bliebe fuer immer stumm")
    assert 'baseline.get("kartentext_de_gefuellt")' in ohne, (
        "die Pruefung liest den Schluessel nicht aus der Grundlinie")
    assert "check_kartentext_de_verlust(" in ohne, (
        "die Pruefung wird in main() gar nicht aufgerufen")
