"""Was ein Ablauf BAUT, muss er auch COMMITTEN.

BEFUND 23.09.2026 — und es war der zweite Fall derselben Sorte.

`champions-replica-scrape.yml` zaehlt im Schritt "Commit + push" siebzehn
Dateien namentlich auf. Zwei Dateien, die Schritte desselben Ablaufs
schreiben, standen nicht darin:

  * data/champions_move_flags.json      (Schritt "Attacken-Merkmale nachziehen")
  * data/champions_namen_entschieden.json (aus build_champions_resources.py)

Beide wurden seit dem 16.09.2026 jede Nacht gebaut und danach mit dem Runner
weggeworfen. Auffallen konnte das nicht: der Lauf war gruen, die Datei lag
im Repo, nur eben vom 16.09. Sichtbar wurde es erst am 23.09.2026, als der
Bestand sich aenderte — "Zing Zap" fiel aus champions_resources.json
(513 -> 512 Attacken), die Merkmalsdatei blieb bei 513, und
tests/unit/test-attacken-merkmale.js hat das Paar auseinanderlaufen sehen.
Deploy 3025, 3026 und 3027 rot.

Derselbe Fehler stand am 05.09.2026 schon einmal im Repo
(champions_speed_corpus.json, zehn Tage alter Stand ausgeliefert) und ist
dort als Kommentar festgehalten worden. Ein Kommentar hat ihn nicht
verhindert. Diese Pruefung tut es.

DIE REGEL steht an ihrer Bedingung: sie gilt fuer jeden Ablauf, der seine
Dateien NAMENTLICH aufzaehlt. Wer `git add -A` oder `git add data` schreibt,
nimmt ohnehin alles mit und wird hier nicht gefragt.
"""

import os
import re

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")

# Ein Pfad, den ein Skript nur LIEST, ist kein Erzeugnis. Unterschieden wird
# am Schreibaufruf: open(..., "w") / "a", to_csv, to_json, Path.write_*.
SCHREIBEND = re.compile(
    r"""(?:open\(\s*([A-Za-z_][A-Za-z0-9_]*|["'][^"']+["'])[^)]*?["'][wa]b?\+?["']"""
    r"""|\.to_csv\(\s*([A-Za-z_][A-Za-z0-9_]*|["'][^"']+["'])"""
    r"""|\.write_text\(|\.write_bytes\()""",
)


def _ablaeufe():
    return sorted(
        os.path.join(ABLAEUFE, f)
        for f in os.listdir(ABLAEUFE)
        if f.endswith((".yml", ".yaml"))
    )


def _git_add_bloecke(text):
    """Jeder `git add`-Aufruf samt Fortsetzungszeilen."""
    bloecke = []
    zeilen = text.splitlines()
    i = 0
    while i < len(zeilen):
        if re.search(r"\bgit add\b", zeilen[i]):
            block = [zeilen[i]]
            while block[-1].rstrip().endswith("\\") and i + 1 < len(zeilen):
                i += 1
                block.append(zeilen[i])
            bloecke.append("\n".join(block))
        i += 1
    return bloecke


def _nimmt_alles(bloecke):
    """`git add -A`, `git add .`, `git add data` — dann ist nichts zu pruefen."""
    for b in bloecke:
        if re.search(r"git add\s+(-A|--all|\.|data|images)\s*$", b, re.M):
            return True
    return False


def _aufgezaehlt(bloecke):
    aus = set()
    for b in bloecke:
        aus |= set(re.findall(r"((?:data|images)/[A-Za-z0-9_\-./]+)", b))
    return aus


def _skripte(text):
    return set(
        re.findall(
            r"(?:python3?|python3? -u)\s+((?:scripts|backend)/[A-Za-z0-9_\-/]+\.py)",
            text,
        )
    )


def _erzeugnisse(skript):
    """Die data/-Dateien, die dieses Skript SCHREIBT."""
    pfad = os.path.join(WURZEL, skript)
    if not os.path.isfile(pfad):
        return set()
    with open(pfad, encoding="utf-8") as f:
        text = f.read()

    # Konstanten aufloesen: ZIEL = os.path.join(DATA, "x.json")
    konst = {}
    for name, datei in re.findall(
        r"^([A-Z][A-Z0-9_]*)\s*=\s*os\.path\.join\([^)]*?[\"']([A-Za-z0-9_\-]+\.(?:json|csv))[\"']\)",
        text,
        re.M,
    ):
        konst[name] = "data/" + datei

    aus = set()
    for treffer in SCHREIBEND.finditer(text):
        ziel = treffer.group(1) or treffer.group(2)
        if not ziel:
            continue
        ziel = ziel.strip()
        if ziel.startswith(("'", '"')):
            roh = ziel.strip("'\"")
            if roh.startswith("data/"):
                aus.add(roh)
        elif ziel in konst:
            aus.add(konst[ziel])
    return aus


def test_jede_gebaute_datei_steht_in_der_commitliste():
    luecken = []
    gepruefte_ablaeufe = 0
    for pfad in _ablaeufe():
        with open(pfad, encoding="utf-8") as f:
            text = f.read()
        bloecke = _git_add_bloecke(text)
        if not bloecke or _nimmt_alles(bloecke):
            continue
        gepruefte_ablaeufe += 1
        liste = _aufgezaehlt(bloecke)
        for skript in sorted(_skripte(text)):
            for datei in sorted(_erzeugnisse(skript)):
                drin = any(
                    datei == e or datei.startswith(e.rstrip("/") + "/") for e in liste
                )
                if not drin:
                    luecken.append(
                        f"{os.path.basename(pfad)}: {skript} schreibt {datei}, "
                        "aber `git add` nennt sie nicht — sie wird mit dem "
                        "Runner weggeworfen"
                    )

    # Ohne diese Untergrenze koennte die Erkennung der `git add`-Bloecke
    # stillschweigend nichts mehr finden und die Pruefung waere gruen,
    # ohne einen einzigen Ablauf angesehen zu haben.
    assert gepruefte_ablaeufe >= 1, (
        "kein einziger Ablauf mit namentlicher Commitliste gefunden — "
        "die Erkennung greift nicht mehr"
    )
    assert not luecken, "\n".join(luecken)


def test_die_erkennung_findet_die_erzeugnisse_ueberhaupt():
    """Verfaelschungsprobe: findet _erzeugnisse() wirklich etwas?

    Ohne diese Zeile koennte die Regex oben leer laufen — dann waere die
    Pruefung darueber gruen, weil sie nichts zu vergleichen hat. Genau so
    war der Fehler sieben Tage lang unsichtbar.
    """
    treffer = _erzeugnisse("scripts/build_champions_move_flags.py")
    assert "data/champions_move_flags.json" in treffer, (
        "die Erkennung findet das Erzeugnis des Merkmale-Bauers nicht — "
        f"gefunden: {sorted(treffer)}"
    )


def test_der_replica_ablauf_nennt_die_beiden_nachgetragenen_dateien():
    """Der gemeldete Fall selbst, namentlich festgehalten.

    Die Pruefung darueber haelt die Regel; diese haelt den FALL. Beides
    wird gebraucht: waere die Erkennung der Erzeugnisse eines Tages
    stumpf, stuende die Regel gruen da und der 23.09. koennte sich
    wiederholen.
    """
    pfad = os.path.join(ABLAEUFE, "champions-replica-scrape.yml")
    with open(pfad, encoding="utf-8") as f:
        liste = _aufgezaehlt(_git_add_bloecke(f.read()))
    for datei in (
        "data/champions_move_flags.json",
        "data/champions_namen_entschieden.json",
    ):
        assert datei in liste, f"{datei} fehlt wieder in der Commitliste"


@pytest.mark.parametrize(
    "erfunden",
    ["git add -A", "git add .", "git add data", "git add   images"],
)
def test_nimmt_alles_erkennt_die_sammelformen(erfunden):
    """Sonst meldete die Pruefung jeden Ablauf mit `git add -A` als Luecke."""
    assert _nimmt_alles([erfunden])


def test_nimmt_alles_erkennt_eine_namentliche_liste_nicht():
    assert not _nimmt_alles(["git add data/x.json \\\n  data/y.json"])
