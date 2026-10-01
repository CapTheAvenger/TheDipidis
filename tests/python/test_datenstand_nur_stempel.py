"""WZ-24 (01.10.2026): data_stand.json wird nicht neu geschrieben, wenn sich
nur `erzeugt_am` aendert (sonst je Lauf ein Commit und ein Deploy fuer nichts)."""
import importlib.util
import json
import os

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
spec = importlib.util.spec_from_file_location("bds", os.path.join(WURZEL, "scripts", "build_data_stand.py"))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

BASIS = {"erzeugt_am": "2026-10-01T00:00:00", "quelle": "git", "dateien": {"a.csv": "2026-09-30"},
         "inhalt_bis": {}, "leer": [], "ohne_stand": [], "inhaltsspalte_unlesbar": []}


def _schreibe(pfad, d):
    pfad.write_text(json.dumps(d), encoding="utf-8")


def test_nur_der_stempel_neu_heisst_unveraendert(tmp_path):
    p = tmp_path / "ds.json"
    _schreibe(p, BASIS)
    neu = dict(BASIS, erzeugt_am="2026-10-02T00:00:00")
    assert B._nur_stempel_neu(str(p), neu) is True


def test_jede_inhaltliche_aenderung_wird_geschrieben(tmp_path):
    p = tmp_path / "ds.json"
    _schreibe(p, BASIS)
    for feld, wert in (("dateien", {"a.csv": "2026-10-01"}), ("leer", ["b.csv"]),
                       ("quelle", "lauf"), ("ohne_stand", ["c.csv"])):
        assert B._nur_stempel_neu(str(p), dict(BASIS, **{feld: wert})) is False, feld


def test_fehlende_oder_kaputte_datei_wird_geschrieben(tmp_path):
    assert B._nur_stempel_neu(str(tmp_path / "gibtsnicht.json"), BASIS) is False
    p = tmp_path / "kaputt.json"
    p.write_text("{", encoding="utf-8")
    assert B._nur_stempel_neu(str(p), BASIS) is False
