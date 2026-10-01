"""DA-24 (01.10.2026): in cardmarket_mapping_verified.csv tragen neun
Produktnummern zwei bestaetigte Karten (aeltere Sets, Fingerabdruck ueber den
Preis, Pool 2-9: benachbarte Nummern mit gleichem Preis sind so nicht zu
trennen). Seit dem Kollisionswaechter (27.09., besetzt_von) kommt keine
dazu. Welche der beiden Karten die richtige ist, ist NICHT GEPRUEFT und wird
nie ueber den Namen entschieden — die Paare stehen hier benannt und datiert;
jede NEUE Doppelung faellt auf."""
import collections
import csv
import os

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

BEKANNT_01_10_2026 = {
    "299540": {("BUS", "112a"), ("BUS", "142")},
    "279943": {("BWP", "30"), ("BWP", "31")},
    "363531": {("DRM", "60"), ("DRM", "60a")},
    "281502": {("FLF", "18"), ("FLF", "19")},
    "276103": {("HL", "28"), ("HL", "29")},
    "817297": {("JTG", "143"), ("JTG", "144")},
    "282722": {("ROS", "54"), ("ROS", "55")},
    "276311": {("TRR", "19"), ("TRR", "20")},
    "315951": {("UPR", "20"), ("UPR", "21")},
}


def _doppelte(zeilen):
    d = collections.defaultdict(set)
    for z in zeilen:
        if z["status"] == "verified" and z["verified_product_id"]:
            d[z["verified_product_id"]].add((z["set"], z["number"]))
    return {k: v for k, v in d.items() if len(v) > 1}


def test_keine_neue_doppelte_nummer():
    with open(os.path.join(WURZEL, "data", "cardmarket_mapping_verified.csv"), encoding="utf-8-sig", newline="") as f:
        gefunden = _doppelte(csv.DictReader(f))
    neu = {k: v for k, v in gefunden.items() if BEKANNT_01_10_2026.get(k) != v}
    assert not neu, f"neue Doppelung bestaetigter Cardmarket-Nummern (nie ueber den Namen aufloesen): {neu}"


def test_waechter_schlaegt_an():
    # Verfaelschungsprobe: eine zusaetzliche Doppelung wird erkannt
    z = [{"status": "verified", "verified_product_id": "1", "set": "AAA", "number": "1"},
         {"status": "verified", "verified_product_id": "1", "set": "AAA", "number": "2"},
         {"status": "no_price_on_page", "verified_product_id": "2", "set": "AAA", "number": "3"},
         {"status": "verified", "verified_product_id": "2", "set": "AAA", "number": "4"}]
    assert _doppelte(z) == {"1": {("AAA", "1"), ("AAA", "2")}}
