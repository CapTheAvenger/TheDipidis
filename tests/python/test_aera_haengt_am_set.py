"""Die Aera-Grenzen haengen am Set, nicht an der Zahl (27.09.2026).

Wochenlauf #164 wurde rot, weil sets.json neu nummeriert wurde: ein Set
unter SSH kam dazu, alles darueber rutschte um eins, und mit festen
Schwellen wurde SSH "extended" (gemessen im Lauf-Protokoll:
`assert pcd.aera_fuer_set("SSH", ordnung) == "legacy"` schlug fehl).

Geprueft wird die AUSFUEHRUNG: dieselbe Ordnung, einmal um eins
verschoben, muss jedes Set gleich einordnen.
"""
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
KERN = os.path.join(WURZEL, "backend", "core")
sys.path.insert(0, KERN)
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("pcd_aera", os.path.join(KERN, "prepare_card_data.py"))
pcd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pcd)

ORDNUNG = json.load(open(os.path.join(WURZEL, "data", "sets.json"), encoding="utf-8"))


def _verschoben(ordnung, ab, um=1):
    return {k: (v + um if isinstance(v, int) and v >= ab else v) for k, v in ordnung.items()}


def test_eine_neunummerierung_aendert_keine_aera():
    # wie im Lauf #164: unter SSH kommt ein Set dazu, alles darueber +1
    neu = _verschoben(ORDNUNG, ab=ORDNUNG["SSH"])
    neu["NEU-ALT"] = ORDNUNG["SSH"]
    for code in ("SSH", "RCL", "MEW", "PAR", "TEF", "BS", "30C", "OBF", "PAF", "TWM"):
        assert pcd.aera_fuer_set(code, neu) == pcd.aera_fuer_set(code, ORDNUNG), code


def test_die_anker_stehen_an_der_grenze():
    assert pcd.aera_fuer_set(pcd.EXTENDED_ANKER, ORDNUNG) == "extended"
    assert pcd.aera_fuer_set(pcd.STANDARD_ANKER, ORDNUNG) == "standard"
    # das Set direkt unter jedem Anker liegt auf der anderen Seite
    unter = {v: k for k, v in ORDNUNG.items() if isinstance(v, int)}
    assert pcd.aera_fuer_set(unter[ORDNUNG[pcd.EXTENDED_ANKER] - 1], ORDNUNG) == "legacy"
    assert pcd.aera_fuer_set(unter[ORDNUNG[pcd.STANDARD_ANKER] - 1], ORDNUNG) == "extended"


def test_ohne_anker_greift_der_rueckfall():
    # Eine feste, kleine Ordnung — NICHT data/sets.json: die wird neu
    # nummeriert, und genau daran ist die erste Fassung dieser Probe im
    # Wochenlauf #165 rot geworden (SSH stand dort auf 113 = Rueckfallgrenze).
    ohne = {"SSH": pcd.EXTENDED_MIN_ORDER - 1, "DAA": pcd.EXTENDED_MIN_ORDER + 1,
            "TEF": pcd.STANDARD_MIN_ORDER + 2}
    assert pcd.aera_fuer_set("TEF", ohne) == "standard"
    assert pcd.aera_fuer_set("DAA", ohne) == "extended"
    assert pcd.aera_fuer_set("SSH", ohne) == "legacy"


def test_der_waechter_spiegelt_den_anker():
    src = open(os.path.join(WURZEL, "scripts", "data_guardian.py"), encoding="utf-8").read()
    ohne = "\n".join(z.split("#")[0] for z in src.splitlines())
    assert 'fw.get("oldest_legal_set")' in ohne and 'order.get("PAR")' not in ohne
    assert "standard_min = 136" not in ohne


def test_der_standard_beginnt_beim_aeltesten_legalen_set():
    """DA-10 (27.09.2026): der Anker war PAR — abgelesen an einer Zahl. Das
    Formatfenster sagt TEF; PAR und PAF sind in TEF-30C nicht legal."""
    fenster = json.load(open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8"))
    assert pcd.STANDARD_ANKER == fenster["oldest_legal_set"].upper()
    assert pcd.aera_fuer_set(pcd.STANDARD_ANKER, ORDNUNG) == "standard"
    for code in ("PAR", "PAF", "MEW"):
        assert pcd.aera_fuer_set(code, ORDNUNG) == "extended", code
    assert pcd.standard_anker({"oldest_legal_set": "svi"}) == "SVI"
    assert pcd.standard_anker({}) == pcd.STANDARD_ANKER_RUECKFALL
