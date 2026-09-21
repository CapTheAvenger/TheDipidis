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
