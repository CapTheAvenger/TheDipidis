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
# Standings mit Spielern, aber ohne Deck-Spalte — so sahen Rare Candy Club
# Blitz #8 und vier weitere Turniere vom 05./06.11.2026 aus.
OHNE_LISTEN = ('<table><tr><td>1</td><td><a href="/tournament/x/player/alolan">'
               'AlolanPersianFan</a></td><td>5 - 0 - 0</td></tr></table>')
# Standings ohne jede Spielerzeile — das waere ein geaenderter Seitenaufbau.
OHNE_SPIELER = "<table><tr><td>nichts</td></tr></table>"


def _zeile(tid, datum, spieler=80, fmt="4"):
    return (f'<tr data-name="Turnier {tid}" data-date="{datum}T12:00:00.000Z" '
            f'data-format="{fmt}" data-players="{spieler}">'
            f'<td><a href="/tournament/{tid}/standings">x</a></td></tr>')


def _seite(zeilen):
    return "<table>" + "".join(zeilen) + "</table>"


class Quelle:
    """Nachgestellte play.limitlesstcg.com — merkt sich jeden Abruf."""

    def __init__(self, seiten, ohne_listen=(), ohne_spieler=()):
        self.seiten = seiten              # [html Seite 1, Seite 2, ...]
        self.ohne_listen = set(ohne_listen)
        self.ohne_spieler = set(ohne_spieler)
        self.abrufe = []

    def __call__(self, url, pause):
        self.abrufe.append(url)
        if "/tournaments/completed" in url:
            n = int(url.split(LO.SEITE_PARAM)[1]) if LO.SEITE_PARAM in url else 1
            return self.seiten[n - 1] if n <= len(self.seiten) else _seite([])
        if url.endswith("/standings"):
            tid = url.split("/tournament/")[1].split("/")[0]
            if tid in self.ohne_spieler:
                return OHNE_SPIELER
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


def test_mehrere_unlesbare_standings_sind_ein_aufbaufehler():
    q = Quelle([], ohne_spieler={"x", "y"})
    with pytest.raises(LO.Teilausfall):
        LO.sammle_mit_bericht(_turniere("x", "y"), 0, holer=q)


def test_viele_turniere_ohne_veroeffentlichte_listen_sind_kein_aufbaufehler():
    """Trockenlauf 07.11.2026: die zwei juengsten Turniere hatten keine
    Listen veroeffentlicht, und der Lauf brach als "Aufbau geaendert" ab.
    Spieler ohne Deck-Spalte ist die Quelle, nicht eine andere Seite."""
    q = Quelle([], ohne_listen={"a", "b", "c"})
    zeilen, ueber = LO.sammle_mit_bericht(_turniere("a", "b", "c"), 0, holer=q)
    assert zeilen == [] and len(ueber) == 3


def test_spielerzeilen_erkennen_den_unterschied():
    assert LO.hat_spielerzeilen(OHNE_LISTEN)
    assert LO.hat_spielerzeilen(STANDINGS)
    assert not LO.hat_spielerzeilen(OHNE_SPIELER)


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


# ── 4. Nachgezogen nach dem Pruefagenten (07.11.2026) ─────────────────

def test_zeitbudget_beendet_vor_dem_naechsten_turnier_und_behaelt_das_fertige(capsys):
    """B1: ohne Budget stirbt ein langer Lauf an der Zeitgrenze des
    Ablaufs, ohne zu schreiben. Mit Budget wird das Fertige behalten."""
    jetzt = {"s": 0.0}

    def uhr():
        return jetzt["s"]

    q = Quelle([])
    echt = q.__call__

    def tickt(url, pause):
        jetzt["s"] += 10 * 60 if url.endswith("/standings") else 0
        return echt(url, pause)

    zeilen, _ = LO.sammle_mit_bericht(_turniere("a", "b", "c"), 0, holer=tickt,
                                      zeitbudget_min=15, uhr=uhr)
    # a beginnt bei 0 (-> 10 min), b beginnt bei 10 (-> 20 min), c wird
    # nicht mehr angefangen.
    assert {z["limitless_tournament_id"] for z in zeilen} == {"a", "b"}
    assert "Zeitbudget" in capsys.readouterr().out


def test_ohne_budget_laeuft_alles():
    zeilen, _ = LO.sammle_mit_bericht(_turniere("a", "b", "c"), 0, holer=Quelle([]))
    assert {z["limitless_tournament_id"] for z in zeilen} == {"a", "b", "c"}


def test_geaenderter_listenverweis_bleibt_nicht_gruen():
    """B2: aendert Limitless die Form des Listenverweises, stehen weiter
    Spieler da, aber nie eine Liste. Viele Turniere, KEINES mit Liste ->
    Aufbaufehler, nicht dauerhaft "Veranstalter ohne Listen"."""
    ids = [f"t{i}" for i in range(LO.OHNE_LISTEN_GRENZE)]
    q = Quelle([], ohne_listen=set(ids))
    with pytest.raises(LO.Teilausfall):
        LO.sammle_mit_bericht(_turniere(*ids), 0, holer=q)


def test_unter_der_zweiten_grenze_ist_ohne_listen_normal():
    ids = [f"t{i}" for i in range(LO.OHNE_LISTEN_GRENZE - 1)]
    zeilen, ueber = LO.sammle_mit_bericht(
        _turniere(*ids), 0, holer=Quelle([], ohne_listen=set(ids)))
    assert zeilen == [] and len(ueber) == len(ids)


def test_viele_ohne_listen_neben_einem_mit_liste_sind_normal():
    """Die DLR-Startwoche: 5 von 8 ohne Listen, die anderen mit."""
    ids = [f"t{i}" for i in range(LO.OHNE_LISTEN_GRENZE + 2)]
    q = Quelle([], ohne_listen=set(ids[1:]))
    zeilen, _ = LO.sammle_mit_bericht(_turniere(*ids), 0, holer=q)
    assert {z["limitless_tournament_id"] for z in zeilen} == {"t0"}


def test_ab_in_deutscher_schreibweise_wird_abgelehnt(tmp_path, capsys):
    """S1: "03.11.2026" ist als Text kleiner als jedes ISO-Datum."""
    rc = LO.main(["--ausgabe", str(tmp_path / "x.csv"), "--pause", "0",
                  "--ab", "03.11.2026"])
    assert rc == 1
    assert "::error::" in capsys.readouterr().out


def test_turniere_deckelt_die_neuen_nicht_den_bestand(tmp_path, monkeypatch):
    """S2: "hoechstens N NEUE" — der Deckel greift nach dem Bestand."""
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "t6a")
    q = Quelle(_drei_seiten())
    monkeypatch.setattr(LO, "hole", q)
    monkeypatch.setattr(LO, "_karten_datenbank", lambda: None)
    assert LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-04",
                    "--turniere", "1"]) == 0
    assert q.standings_abrufe() == ["t6b"]


def test_beide_ablaeufe_setzen_ein_zeitbudget_unter_ihrer_grenze():
    import re
    for datei, grenze in (("weekly-full-update.yml", 300), ("online-decklists.yml", 150)):
        with open(os.path.join(WURZEL, ".github", "workflows", datei), encoding="utf-8") as f:
            text = "\n".join(z for z in f.read().splitlines() if not z.strip().startswith("#"))
        m = re.search(r"--zeitbudget (\d+)", text)
        assert m, f"{datei} ruft den Scraper ohne Zeitbudget"
        assert int(m.group(1)) < grenze, f"{datei}: Budget {m.group(1)} >= Grenze {grenze}"


# ── 5. Nachpruefung (07.11.2026) ──────────────────────────────────────

class _Uhr:
    """Zaehlt je Standings-Abruf `je_turnier` Minuten, je Liste `je_liste`."""

    def __init__(self, je_turnier=10, je_liste=0):
        self.s, self.je_turnier, self.je_liste = 0.0, je_turnier, je_liste

    def __call__(self):
        return self.s

    def holer(self, quelle):
        def h(url, pause):
            if url.endswith("/standings"):
                self.s += self.je_turnier * 60
            elif "decklist" in url:
                self.s += self.je_liste * 60
            return quelle(url, pause)
        return h


def test_main_reicht_das_zeitbudget_wirklich_weiter(tmp_path, monkeypatch):
    """Ohne Verdrahtung waere B1 still wieder offen."""
    ziel = str(tmp_path / "per_player.csv")
    _bestand_mit(ziel, "alt")
    uhr = _Uhr(je_turnier=10)
    q = Quelle(_drei_seiten())
    monkeypatch.setattr(LO, "hole", uhr.holer(q))
    monkeypatch.setattr(LO.time, "monotonic", uhr)
    monkeypatch.setattr(LO, "_karten_datenbank", lambda: None)
    assert LO.main(["--ausgabe", ziel, "--pause", "0", "--ab", "2026-11-04",
                    "--zeitbudget", "15"]) == 0
    assert q.standings_abrufe() == ["t6a", "t6b"]      # t5a, t4a nicht mehr


def test_harte_grenze_verwirft_das_ueberlange_turnier_und_behaelt_den_rest(capsys):
    """Drosselung mitten in einem Turnier: Budget greift erst vor dem
    naechsten Turnier — die harte Grenze verwirft das laufende ganz."""
    uhr = _Uhr(je_turnier=0, je_liste=0)
    q = Quelle([])
    h = uhr.holer(q)
    gezaehlt = {"n": 0}

    def gedrosselt(url, pause):
        if "decklist" in url:
            gezaehlt["n"] += 1
            # Turnier a: 4 Listen je 1 min; Turnier b: jede Liste 30 min
            uhr.s += (1 if gezaehlt["n"] <= 4 else 30) * 60
        return h(url, pause)

    zeilen, ueber = LO.sammle_mit_bericht(_turniere("a", "b", "c"), 0,
                                          holer=gedrosselt, zeitbudget_min=10, uhr=uhr)
    assert {z["limitless_tournament_id"] for z in zeilen} == {"a"}
    assert any("harte Zeitgrenze" in g for _t, g in ueber)
    assert "c" not in q.standings_abrufe()


def test_mischfall_ohne_listen_und_unlesbar_bleibt_nicht_gruen():
    n = LO.OHNE_LISTEN_GRENZE
    ohne = {f"o{i}" for i in range(n - 1)}
    q = Quelle([], ohne_listen=ohne, ohne_spieler={"kaputt"})
    with pytest.raises(LO.Teilausfall):
        LO.sammle_mit_bericht(_turniere(*sorted(ohne), "kaputt"), 0, holer=q)


def test_unlesbare_turniere_stehen_als_zahl_da_auch_wenn_andere_liefern(capsys):
    q = Quelle([], ohne_spieler={"kaputt"})
    zeilen, _ = LO.sammle_mit_bericht(_turniere("a", "kaputt"), 0, holer=q)
    assert zeilen
    assert "1 von 2 Turnier(en) unlesbar" in capsys.readouterr().out
