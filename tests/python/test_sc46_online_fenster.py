"""SC-46 (07.11.2026): die Online-Einzellisten verlieren keine Tage mehr.

BEFUND, gemessen 07.11.2026 an der Quelle und am Wochenlauf #199:

1. Der Lauf las nur die ERSTE Uebersichtsseite (25 Turniere aller
   Formate, knapp zwei Tage). Der Wochenlauf kommt Di + Fr. Zwischen
   14.10. und 06.11. standen an der Quelle 101 passende Turniere, bei uns
   51 — Tage wie der 24.10. oder der 05.11. fehlten ganz.
2. Ein einziges Turnier ohne veroeffentlichte Liste (Rare Candy Club
   Blitz #8, 106 Spieler, keine Deck-Spalte) warf `Teilausfall`, und der
   Lauf schrieb NICHTS — die sechs anderen Turniere gingen mit verloren
   (504.423 -> 504.423 Zeilen).
3. Der Wochenlauf behauptete seit #134, der Scraper ueberspringe Turniere
   im Bestand. Er tat es nicht.

Geprueft wird das VERHALTEN: die Funktionen laufen gegen eine
nachgestellte Quelle (Uebersichtsseiten, Standings, Decklisten aus den
echten Ausschnitten in tests/fixtures/), kein Text wird gelesen.
"""
import csv
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
FIXTUREN = os.path.join(WURZEL, "tests", "fixtures")
for _p in (os.path.join(WURZEL, "backend", "core"),
           os.path.join(WURZEL, "backend", "scrapers")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import limitless_online_decklist_scraper as LO  # noqa: E402


def _lies(name):
    with open(os.path.join(FIXTUREN, name), encoding="utf-8") as f:
        return f.read()


STANDINGS = _lies("limitless_online_standings.html")
DECKLISTE = _lies("limitless_online_decklist.html")
# Standings ohne jede Deck-Spalte — so sah Rare Candy Club Blitz #8 aus.
OHNE_LISTEN = "<table><tr><td>1</td><td>AlolanPersianFan</td><td>5 - 0 - 0</td></tr></table>"


def _zeile(tid, datum, spieler=80, fmt="4"):
    return (f'<tr data-name="Turnier {tid}" data-date="{datum}T12:00:00.000Z" '
            f'data-format="{fmt}" data-players="{spieler}">'
            f'<td><a href="/tournament/{tid}/standings">x</a></td></tr>')


def _seite(zeilen):
    return "<table>" + "".join(zeilen) + "</table>"


class Quelle:
    """Nachgestellte play.limitlesstcg.com — merkt sich jeden Abruf."""

    def __init__(self, seiten, ohne_listen=()):
        self.seiten = seiten              # [html Seite 1, Seite 2, ...]
        self.ohne_listen = set(ohne_listen)
        self.abrufe = []

    def __call__(self, url, pause):
        self.abrufe.append(url)
        if "/tournaments/completed" in url:
            n = int(url.split(LO.SEITE_PARAM)[1]) if LO.SEITE_PARAM in url else 1
            return self.seiten[n - 1] if n <= len(self.seiten) else _seite([])
        if url.endswith("/standings"):
            tid = url.split("/tournament/")[1].split("/")[0]
            return OHNE_LISTEN if tid in self.ohne_listen else STANDINGS
        if "decklist" in url:
            return DECKLISTE
        raise AssertionError(f"unerwarteter Abruf: {url}")

    def standings_abrufe(self):
        return [u.split("/tournament/")[1].split("/")[0]
                for u in self.abrufe if u.endswith("/standings")]


def _drei_seiten():
    return [
        _seite([_zeile("t6a", "2026-11-06"), _zeile("t6b", "2026-11-06"),
                _zeile("t5a", "2026-11-05")]),
        _seite([_zeile("t4a", "2026-11-04"), _zeile("t3a", "2026-11-03")]),
        _seite([_zeile("t2a", "2026-11-02"), _zeile("t1a", "2026-11-01")]),
        _seite([_zeile("alt", "2026-10-20")]),
    ]


# ── 1. Die Turnierliste blaettert bis vor das Fenster ────────────────

def test_blaettert_bis_vor_das_fenster_und_nicht_weiter():
    q = Quelle(_drei_seiten())
    alle = LO.hole_turnierliste(0, "2026-11-03", holer=q)
    seiten = [u for u in q.abrufe if "/tournaments/completed" in u]
    # Seite 2 endet am 03.11. (= Fensteranfang, noch drin) -> weiter;
    # Seite 3 endet am 01.11. (davor) -> Schluss. Seite 4 wird nie geholt.
    assert len(seiten) == 3, seiten
    assert [t["id"] for t in alle] == ["t6a", "t6b", "t5a", "t4a", "t3a", "t2a", "t1a"]
    assert [t["id"] for t in LO.im_fenster(alle, "2026-11-03")] == \
        ["t6a", "t6b", "t5a", "t4a", "t3a"]


def test_mehr_als_eine_seite_wird_gelesen():
    """Der Fall vom 06.11.: alles, was nicht auf Seite 1 stand, fehlte."""
    q = Quelle(_drei_seiten())
    alle = LO.hole_turnierliste(0, "2026-11-01", holer=q)
    assert {"t4a", "t3a", "t2a", "t1a"} <= {t["id"] for t in alle}


def test_doppelte_zeile_beim_blaettern_faellt_zusammen():
    seiten = _drei_seiten()
    seiten[1] = _seite([_zeile("t5a", "2026-11-05"), _zeile("t4a", "2026-11-04"),
                        _zeile("t3a", "2026-11-03")])
    alle = LO.hole_turnierliste(0, "2026-11-04", holer=Quelle(seiten))
    ids = [t["id"] for t in alle]
    assert ids.count("t5a") == 1, ids


def test_leere_erste_seite_ist_ein_aufbaufehler():
    with pytest.raises(LO.Teilausfall):
        LO.hole_turnierliste(0, "2026-11-01", holer=Quelle([_seite([])]))


def test_der_deckel_haelt_eine_endlose_liste_an(capsys):
    endlos = [_seite([_zeile(f"t{i}", "2026-11-06")]) for i in range(5)]
    alle = LO.hole_turnierliste(0, "2026-11-01", max_seiten=3, holer=Quelle(endlos))
    assert len(alle) == 3
    assert "::warning::" in capsys.readouterr().out


# ── 2. Ein Turnier ohne Listen reisst die anderen nicht mit ──────────

def _turniere(*ids):
    return [{"id": i, "name": f"Turnier {i}", "datum": "2026-11-06", "format": "4",
             "spieler": 80, "url": f"{LO.BASIS}/tournament/{i}/standings"} for i in ids]


def test_turnier_ohne_listen_wird_uebersprungen_der_rest_bleibt(capsys):
    q = Quelle([], ohne_listen={"leer"})
    zeilen, ueber = LO.sammle_mit_bericht(_turniere("a", "leer", "b"), 0, holer=q)
    assert {z["limitless_tournament_id"] for z in zeilen} == {"a", "b"}
    assert [t["id"] for t, _g in ueber] == ["leer"]
    assert "::warning::" in capsys.readouterr().out


def test_kaputte_liste_nimmt_nur_ihr_turnier_heraus(monkeypatch):
    echt = LO.lies_deckliste
    zaehler = {"n": 0}

    def bricht_im_zweiten_turnier(html, card_db=None):
        zaehler["n"] += 1
        if zaehler["n"] == 6:   # Turnier "b" (Listen 5-8): die zweite bricht
            raise LO.Teilausfall("Deckliste: keine Karten gefunden")
        return echt(html, card_db)

    monkeypatch.setattr(LO, "lies_deckliste", bricht_im_zweiten_turnier)
    zeilen, ueber = LO.sammle_mit_bericht(_turniere("a", "b", "c"), 0, holer=Quelle([]))
    # Turnier b geht ganz heraus — keine halbe Auswertung.
    assert {z["limitless_tournament_id"] for z in zeilen} == {"a", "c"}
    assert [t["id"] for t, _g in ueber] == ["b"]


def test_viele_turniere_ganz_ohne_listen_sind_ein_aufbaufehler():
    q = Quelle([], ohne_listen={"x", "y"})
    with pytest.raises(LO.Teilausfall):
        LO.sammle_mit_bericht(_turniere("x", "y"), 0, holer=q)


def test_ein_einzelnes_turnier_ohne_listen_ist_kein_aufbaufehler():
    zeilen, ueber = LO.sammle_mit_bericht(
        _turniere("leer"), 0, holer=Quelle([], ohne_listen={"leer"}))
    assert zeilen == [] and len(ueber) == 1


# ── 3. Der Lauf als Ganzes: Bestand, Fenster, "nichts Neues" ─────────

def _bestand_mit(pfad, tid):
    felder = list(LO.CSV_FIELDS)
    with open(pfad, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        w.writerow({**{k: "" for k in felder}, "limitless_tournament_id": tid,
                    "player_name": "alt", "deck_slug": "x", "quelle": "online",
                    "tournament_date": "2026-11-05"})


def test_bekannte_turniere_werden_nicht_noch_einmal_geholt(tmp_path, monkeypatch):
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "t5a")
    q = Quelle(_drei_seiten(), ohne_listen={"t6b"})
    monkeypatch.setattr(LO, "hole", q)
    monkeypatch.setattr(LO, "_karten_datenbank", lambda: None)
    rc = LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-04"])
    assert rc == 0
    # t5a steht im Bestand -> keine Standings; t6b ohne Listen -> benannt
    # uebersprungen; t6a und t4a geschrieben.
    assert q.standings_abrufe() == ["t6a", "t6b", "t4a"]
    with open(ziel, encoding="utf-8") as f:
        ids = {z["limitless_tournament_id"] for z in csv.DictReader(f)}
    assert ids == {"t5a", "t6a", "t4a"}


def test_nichts_neues_ist_kein_fehler(tmp_path, monkeypatch):
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "nur")
    q = Quelle([_seite([_zeile("nur", "2026-11-06")])])
    monkeypatch.setattr(LO, "hole", q)
    assert LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-01"]) == 0
    assert q.standings_abrufe() == []


def test_das_eine_neue_turnier_ohne_listen_ist_kein_fehler(tmp_path, monkeypatch):
    """Der Lauf vom 06.11. haette damit rc 0 gehabt statt rc 1."""
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "alt")
    q = Quelle([_seite([_zeile("blitz8", "2026-11-06", spieler=106)])],
               ohne_listen={"blitz8"})
    monkeypatch.setattr(LO, "hole", q)
    monkeypatch.setattr(LO, "_karten_datenbank", lambda: None)
    assert LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-01"]) == 0


def test_ohne_ab_gilt_das_fenster_der_letzten_tage(tmp_path, monkeypatch):
    ziel = str(tmp_path / "per_player.csv")
    gesehen = {}

    def merkt(pause, ab, **kw):
        gesehen["ab"] = ab
        return []

    monkeypatch.setattr(LO, "hole_turnierliste", merkt)
    LO.main(["--ausgabe", ziel, "--pause", "0", "--tage", "14"])
    heute = LO.datetime.now(LO.timezone.utc).date()
    assert gesehen["ab"] == (heute - LO.timedelta(days=14)).isoformat()


def test_auch_bekannte_holt_den_bestand_neu(tmp_path, monkeypatch):
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "nur")
    q = Quelle([_seite([_zeile("nur", "2026-11-06")])])
    monkeypatch.setattr(LO, "hole", q)
    monkeypatch.setattr(LO, "_karten_datenbank", lambda: None)
    assert LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-01",
                    "--auch-bekannte"]) == 0
    assert q.standings_abrufe() == ["nur"]


def test_das_fenster_reicht_weiter_als_der_abstand_der_wochenlaeufe():
    """Di -> Fr sind 3 Tage, Fr -> Di 4. Ein Fenster darunter verliert
    wieder Tage; 14 laesst eine ausgefallene Woche von selbst heilen."""
    assert LO.TAGE_FENSTER >= 7
