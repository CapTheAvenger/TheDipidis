"""Alles, was ein Ablauf commitet, kann das Tor zurueckrollen — und nie halb (SC-38).

Zweimal rollte das Tor einen Teil zurueck und liess den Rest stehen, und
zweimal erzeugte das Zurueckrollen selbst den Widerspruch, an dem der
zweite Durchlauf scheiterte: 09.10. (abgeleiteter Pokedex blieb frisch,
SC-29) und 17.10. (gespiegelte Icons blieben liegen, SC-36).

Die Regel jetzt:
  1. Welche Pfade ausserhalb von data/ ein Lauf schreibt, liest
     tor_rollback.ausgabeordner() aus den `git add`-Zeilen der Ablaeufe —
     keine Handliste mehr.
  2. Jeder solche Pfad gehoert zu einer FAMILIE. Bekommt ein Ablauf einen
     neuen Ausgabeordner ohne Familie, wird es HIER rot — im PR, nicht
     nachts im Datenlauf.
"""
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))
import tor_rollback  # noqa: E402


def _in_familie(pfad):
    probe = pfad + "probe.png" if pfad.endswith("/") else pfad
    return any(muster.match(probe) for _, muster in tor_rollback.FAMILIEN)


def ungedeckt(ordner):
    return [p for p in ordner if not _in_familie(p)]


def test_ausgaben_kommen_aus_den_ablaeufen(monkeypatch):
    monkeypatch.chdir(WURZEL)
    aus = tor_rollback.ausgabeordner()
    # Gegen den Leerlauf: die zwei Bildordner der Champions-Laeufe MUESSEN da sein.
    assert "images/champions-items/" in aus and "images/champions/" in aus, aus
    assert not any(p.startswith(("data", "backend/core/data")) for p in aus), aus


def test_jede_ausgabe_steht_in_einer_familie(monkeypatch):
    monkeypatch.chdir(WURZEL)
    offen = ungedeckt(tor_rollback.ausgabeordner())
    assert not offen, ("diese Ausgabeordner rollen ohne ihre Daten zurueck — Familie in "
                       "scripts/tor_rollback.py ergaenzen: " + ", ".join(offen))


def test_ein_neuer_ordner_ohne_familie_faellt_auf(tmp_path, monkeypatch):
    """Die Probe zur Regel darueber: ein Ablauf mit Tor und Push bekommt einen
    neuen Ausgabeordner — er muss als ungedeckt gemeldet werden."""
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    (tmp_path / "images" / "neu").mkdir(parents=True)
    (tmp_path / "images" / "champions-items").mkdir(parents=True)
    (tmp_path / ".github" / "workflows" / "x.yml").write_text(
        "steps:\n  - run: |\n      bash scripts/tor_vor_dem_push.sh alle\n"
        "      git add data/a.json \\\n        images/neu images/champions-items || true\n"
        "      bash scripts/push_nach_rebase.sh alle\n")
    (tmp_path / ".github" / "workflows" / "ohne_push.yml").write_text(
        "steps:\n  - run: |\n      bash scripts/tor_vor_dem_push.sh kern\n      git add -A data images/neu2\n")
    monkeypatch.chdir(tmp_path)
    aus = tor_rollback.ausgabeordner()
    assert aus == ("images/champions-items/", "images/neu/"), aus
    assert ungedeckt(aus) == ["images/neu/"]


def test_der_parser_nimmt_fortsetzungen_und_keine_schalter():
    pfade = tor_rollback._git_add_pfade(
        "git add -A -- $rollback || true\n"
        "git add data/a.json \\\n   images/x  # Kommentar\n"
        "[ -f y ] && git add data/y.json\n")
    assert pfade == ["data/a.json", "images/x", "data/y.json"], pfade


# ── SC-39 (17.10.2026): der Wochenlauf faehrt dasselbe Tor ─────────────────
#
# Wochenlauf #181 (13.10.) warf die ganzen Wochendaten weg, weil zwei Dateien
# rot waren — sein eigenes Tor kannte kein Zurueckrollen (SC-34).

def _wochenlauf_schritte():
    import yaml
    with open(os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml"),
              encoding="utf-8") as f:
        y = yaml.safe_load(f)
    return [s for job in y["jobs"].values() for s in job.get("steps", [])]


def test_der_wochenlauf_faehrt_das_tor_mit_zurueckrollen():
    schritte = _wochenlauf_schritte()
    tor = next(s for s in schritte if s.get("id") == "pruefen")
    run = "\n".join(z for z in tor["run"].splitlines() if not z.lstrip().startswith("#"))
    assert "bash scripts/tor_vor_dem_push.sh kern" in run
    assert "TOR_OHNE_ROLLBACK" not in run, "das Zurueckrollen ist der Sinn dieses Umbaus"
    namen = [s.get("name") for s in schritte]
    sicherung = schritte[namen.index("Tor-Protokolle sichern")]
    assert "steps.pruefen.outputs.rollback" in sicherung.get("if", "")
    assert namen.index("Tor-Protokolle sichern") < namen.index("Commit + push")


def test_turnierdaten_gehen_nur_gemeinsam_zurueck():
    e = tor_rollback.einheiten([
        "data/labs_tournament_decks_TEF-30C.csv", "data/tournament_decklists_per_player.csv",
        "data/player_continuity.csv", "data/deckempfehlung.json",
        "data/masterclass_live/dragapult.json", "data/price_data.csv"])
    gross = [x for x in e if len(x) > 1]
    assert len(gross) == 1 and len(gross[0]) == 5, e
    assert ["data/price_data.csv"] in e, "eine fremde Datei darf nicht in die Familie geraten"


def test_das_online_fenster_geht_nur_mit_seinem_kopf_zurueck():
    """SC-42 (27.10.2026): Wochenlauf #189 hielt limitless_online_fenster.csv
    zurueck und lieferte die _meta.json — Tabelle und Kopf aus zwei Wochen."""
    e = tor_rollback.einheiten(["data/limitless_online_fenster.csv",
                                "data/limitless_online_fenster_meta.json",
                                "data/limitless_online_decks.csv"])
    assert ["data/limitless_online_fenster.csv", "data/limitless_online_fenster_meta.json"] in e, e
    assert ["data/limitless_online_decks.csv"] in e, "eine fremde Datei darf nicht hinein"
