"""scripts/regulation_marks_nachziehen.py + data/regulation_marks.json (DA-28).

Hausi, 30.09.2026: Standard-Legalitaet ueber die Regulierungsmarken statt
Pauschale fuer SVP/SVE. Der Sandkasten erreicht die Quelle nicht; das Abrufen
wird durch eine Attrappe im Aufbau der am 30.09.2026 im Browser gemessenen
Listenseite ersetzt (display=list, show=100). Parser, Verdichtung, Schutz-
regeln und das Schreiben laufen echt.
"""
import csv
import importlib.util
import json
import os
import re

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, "scripts", "regulation_marks_nachziehen.py")
DATEI = os.path.join(WURZEL, "data", "regulation_marks.json")
DB = os.path.join(WURZEL, "data", "all_cards_database.csv")


@pytest.fixture()
def m():
    spec = importlib.util.spec_from_file_location("reg_nachziehen", SKRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _zeile(s, n):
    return ('<tr data-hover="URL"> <td><span class="card-set" data-tooltip="X">'
            '<img class="set" alt="%s" src="URL" loading="lazy">%s</span></td> '
            '<td><a href="/cards/%s/%s">%s</a></td> <td><a href="/cards/%s/%s">Name</a></td></tr>'
            % (s, s, s, n, n, s, n))


KOPF = '<table><tr><th class="sort">Set</th><th class="sort">No.</th></tr>'


def _quelle(je_marke):
    def holen(url):
        mk, p = re.search(r"regulation%3D(\w)&.*page=(\d+)", url).groups()
        z = je_marke[mk][(int(p) - 1) * 100:int(p) * 100]
        return KOPF + "".join(_zeile(s, n) for s, n in z) + "</table>"
    return holen


def _drucke(n, satz="ASC"):
    return [(satz, str(i)) for i in range(1, n + 1)]


def test_parser_liest_set_und_nummer_nicht_die_kopfzeile(m):
    html = KOPF + _zeile("SVP", "87") + _zeile("30C", "CC30") + "</table>"
    assert m.drucke_aus_seite(html) == [("SVP", "87"), ("30C", "CC30")]


def test_verdichten_und_zurueck_ist_verlustfrei(m):
    nums = ["1", "2", "3", "7", "9", "10", "G", "CC30"]
    assert m.komprimiere(nums) == "1-3,7,9-10,CC30,G"
    assert sorted(m.expandiere(m.komprimiere(nums))) == sorted(nums)


def test_seitenweise_bis_zur_leeren_seite(m):
    quelle = {k: _drucke(250) for k in m.MARKEN}
    neu, meld = m.nachziehen(holen=_quelle(quelle), alt=None)
    assert neu["counts"] == {k: 250 for k in m.MARKEN}  # 3 Seiten je Marke
    assert neu["marks"]["H"]["ASC"] == "1-250"


def test_zu_wenig_schreibt_nichts(m):
    alt = {"counts": {k: 200 for k in m.MARKEN}, "marks": {}}
    quelle = {k: _drucke(200) for k in m.MARKEN}
    quelle["I"] = _drucke(150)  # 75 % < 90 %
    neu, meld = m.nachziehen(holen=_quelle(quelle), alt=alt)
    assert neu is None and "Marke I" in meld[0]


def test_leere_marke_schreibt_nichts(m):
    quelle = {k: _drucke(50) for k in m.MARKEN}
    quelle["J"] = []
    neu, meld = m.nachziehen(holen=_quelle(quelle), alt=None)
    assert neu is None


def test_unveraendert_fasst_nichts_an(m):
    quelle = {k: _drucke(120) for k in m.MARKEN}
    erst, _ = m.nachziehen(holen=_quelle(quelle), alt=None)
    neu, meld = m.nachziehen(holen=_quelle(quelle), alt=erst)
    assert neu is None and meld == ["unveraendert"]


def test_unerreichbare_quelle_ist_luecke_kein_absturz(m):
    def kaputt(url):
        raise OSError("403")
    neu, meld = m.nachziehen(holen=kaputt, alt=None)
    assert neu is None and "nicht lesbar" in meld[0]


def test_main_schreibt_datei_und_ist_danach_stabil(m, tmp_path, monkeypatch):
    ziel = tmp_path / "regulation_marks.json"
    quelle = {k: _drucke(120) for k in m.MARKEN}
    monkeypatch.setattr(m, "DATEI", str(ziel))
    monkeypatch.setattr(m, "http_holen", _quelle(quelle))
    monkeypatch.setattr(m, "nachziehen", lambda holen=None, alt=None, _n=m.nachziehen: _n(holen=_quelle(quelle), alt=alt))
    assert m.main([]) == 0
    d1 = ziel.read_text(encoding="utf-8")
    assert json.loads(d1)["counts"]["G"] == 120
    assert m.main([]) == 0 and ziel.read_text(encoding="utf-8") == d1  # unveraendert


# ---- die eingecheckte Datei (Stand 30.09.2026, im Browser gemessen) --------

def _index():
    m = importlib.util.module_from_spec(importlib.util.spec_from_file_location("r", SKRIPT))
    m.__spec__.loader.exec_module(m)
    d = json.load(open(DATEI, encoding="utf-8"))
    idx = {}
    for mk, sets in d["marks"].items():
        for s, v in sets.items():
            for n in m.expandiere(v):
                idx[(s, n)] = mk
    return d, idx


def test_datei_zaehlung_stimmt_mit_inhalt_und_quelle():
    d, idx = _index()
    assert d["counts"] == {"G": 1647, "H": 1303, "I": 1277, "J": 640}  # Seitenkopf 30.09.2026
    assert len(idx) == sum(d["counts"].values())  # kein Druck in zwei Marken


def test_svp_und_mep_sind_vollstaendig_mit_marke_belegt():
    _, idx = _index()
    rows = list(csv.DictReader(open(DB, encoding="utf-8")))
    for satz in ("SVP", "MEP"):
        fehlt = [r["number"] for r in rows if r["set"] == satz
                 and (satz, r["number"].lstrip("0") or "0") not in idx]
        assert fehlt == [], f"{satz}: Drucke ohne Marke {fehlt[:10]}"
