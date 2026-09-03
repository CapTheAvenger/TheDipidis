"""Die Schwellen des Waechters sind zugesichert, nicht nur notiert.

ANLASS (02.09.2026)
-------------------
Zwoelf Schwellenwerte in scripts/data_guardian.py wurden gleichzeitig auf
absurde Werte gesetzt (10.0 -> 999.0, 21 -> 99999, 3/5/10 Tage -> 9999,
60 -> 9999, `pct < 90.0` -> `pct < 0.0`) und die Python-Suite lief:

    1032 passed, 6 skipped

Null Fehlschlaege. Die Funktionen check_coverage, check_shrink,
check_freshness und check_proxy_frische wurden von KEINEM Test je
aufgerufen.

Das ist die unangenehmste Sorte Luecke: der Waechter ist genau das
Bauteil, das anschlagen soll, wenn die Daten kaputtgehen. Steht seine
Schwelle falsch, faellt er still aus — und niemand merkt es, weil ein
stiller Waechter genauso aussieht wie gesunde Daten.

WIE HIER GEPRUEFT WIRD
----------------------
Nicht durch Spiegeln der Konstante ("assert COVERAGE_DROP_PP == 10.0") —
das haelt eine Zahl fest, nicht ihre Wirkung, und muesste bei jeder
begruendeten Anpassung mitgeaendert werden, ohne je etwas zu fangen.

Stattdessen am RAND: ein Fall knapp diesseits und einer knapp jenseits.
Damit ist die Schwelle auf einen Schritt genau festgenagelt, und die
Funktion wird tatsaechlich ausgefuehrt.
"""
import datetime as dt
import importlib.util
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'scripts', 'data_guardian.py')


@pytest.fixture(scope='module')
def g():
    spec = importlib.util.spec_from_file_location('dg', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def stufen(findings):
    return [s for s, _ in findings]


def texte(findings):
    return ' | '.join(t for _, t in findings)


# ── check_coverage ──────────────────────────────────────────────────────

def test_neues_set_unter_90_prozent_ist_kritisch(g):
    """Ein neues Set, das kaum zugeordnet wurde, ist der PBL-Fall."""
    f = []
    g.check_coverage(f, {'XYZ': (89, 100, 89.0)}, {})
    assert 'CRITICAL' in stufen(f), (
        'ein neu aufgetauchtes Set mit 89 % Zuordnung schlaegt nicht mehr an — '
        f'gemeldet wurde: {texte(f) or "nichts"}')


def test_neues_set_ueber_90_prozent_ist_still(g):
    f = []
    g.check_coverage(f, {'XYZ': (91, 100, 91.0)}, {})
    assert not f, (
        f'ein neues Set mit 91 % loest einen Befund aus: {texte(f)}. Die '
        'Schwelle liegt bei 90 % — darueber ist Ruhe, sonst ist der Waechter '
        'nur noch Rauschen')


def test_einbruch_ueber_der_schwelle_ist_kritisch(g):
    """Zehn Prozentpunkte Verlust sind der Rueckschritt, um den es geht."""
    f = []
    g.check_coverage(f, {'ABC': (89, 100, 89.0)}, {'ABC': (99, 100, 99.1)})
    assert 'CRITICAL' in stufen(f), (
        f'ein Einbruch um 10,1 Punkte bleibt unbemerkt (gemeldet: {texte(f) or "nichts"}). '
        'Genau dafuer ist COVERAGE_DROP_PP da')


def test_einbruch_unter_der_schwelle_ist_still(g):
    f = []
    g.check_coverage(f, {'ABC': (90, 100, 90.0)}, {'ABC': (99, 100, 99.0)})
    assert not f, (
        f'ein Einbruch um 9 Punkte schlaegt an: {texte(f)}. Absolute Schwellen '
        'erzeugen hier Rauschen — CLAUDE.md: "Detect change against a baseline"')


def test_verschwundenes_set_wird_gemeldet(g):
    f = []
    g.check_coverage(f, {}, {'WEG': (10, 10, 100.0)})
    assert 'WARN' in stufen(f), 'ein komplett verschwundenes Set faellt niemandem auf'


# ── check_shrink ────────────────────────────────────────────────────────

def test_datei_verliert_mehr_als_zehn_prozent(g):
    f = []
    g.check_shrink(f, {'x.csv': 89}, {'x.csv': 100})
    assert 'CRITICAL' in stufen(f), (
        'eine Datei darf 11 % ihrer Zeilen verlieren, ohne dass es auffaellt — '
        'das ist die Signatur eines fehlgeschlagenen Abrufs')


def test_datei_verliert_weniger_als_zehn_prozent(g):
    f = []
    g.check_shrink(f, {'x.csv': 91}, {'x.csv': 100})
    assert not f, (
        f'9 % Schwund schlagen an: {texte(f)}. Diese Dateien schwanken von '
        'Natur aus')


def test_ohne_grundlinie_kein_urteil(g):
    """Keine Vorher-Zahl heisst: nichts zu vergleichen, nicht "alles weg"."""
    f = []
    g.check_shrink(f, {'neu.csv': 3}, {})
    assert not f, f'eine Datei ohne Grundlinie wird beurteilt: {texte(f)}'


# ── Die Frische-Fenster ─────────────────────────────────────────────────

def test_die_frische_fenster_passen_zum_fahrplan(g):
    """Nicht die Zahlen spiegeln, sondern ihren Bezug zum Fahrplan pruefen.

    weekly-full-update laeuft Di+Fr (cron '0 6 * * 2,5'). Die groesste
    Luecke zwischen zwei Laeufen sind also vier Tage (Fr -> Di). Ein
    Fenster, das kleiner ist als die Luecke, feuert strukturell garantiert
    falsch — genau der Fehler, der mit der alten 3-Tage-Schwelle jeden
    Montag und Dienstag passierte.
    """
    for datei, (max_alter, wer) in g.REFRESH_DRIVEN.items():
        if 'weekly-full-update' in wer:
            assert max_alter >= 4, (
                f'{datei} darf nur {max_alter} Tage alt werden, wird aber von '
                f'{wer} geschrieben. Die groesste Luecke zwischen zwei '
                'Wochenlaeufen (Fr -> Di) sind vier Tage — dieses Fenster '
                'feuert an jedem Montag garantiert falsch')
        assert max_alter <= 14, (
            f'{datei} darf {max_alter} Tage alt werden. So weit gefasst faellt '
            'ein toter Job wochenlang nicht auf')

    for datei, max_alter in g.CONTENT_DRIVEN.items():
        assert max_alter >= 30, (
            f'{datei} steht auf {max_alter} Tagen. Ihr Build ist absichtlich '
            'inkrementell (CLAUDE.md: "never re-fetch data you already have") — '
            'sie bleibt wochenlang byte-identisch, WAEHREND ihr Job gruen '
            'laeuft. Ein enges Fenster ist hier reines Rauschen')


def test_leere_dateien_bekommen_zeit_aber_nicht_unbegrenzt(g):
    """Eine JP-Set-Rotation leert die City-League-Dateien fuer ein paar Tage."""
    assert 14 <= g.EMPTY_STALE_DAYS <= 35, (
        f'EMPTY_STALE_DAYS steht auf {g.EMPTY_STALE_DAYS}. Unter zwei Wochen '
        'schlaegt eine normale Set-Rotation an, ueber fuenf Wochen faellt eine '
        'nie wieder gefuellte Datei einen Monat lang nicht auf')


def test_mindestzahl_fuer_abdeckung_ist_gesetzt(g):
    assert g.MIN_CARDS_FOR_COVERAGE >= 2, (
        'ohne Mindestzahl wird eine Abdeckungsquote aus einer einzigen Karte '
        'gerechnet — 0/1 sind 0 %, und das meldet sich als Totalausfall')


# ── Die Funktionen werden ueberhaupt aufgerufen ─────────────────────────

def test_die_vier_stillen_funktionen_haben_jetzt_aufrufer():
    """Bis zum 02.09.2026 rief sie kein Test auf. Diese Datei tut es —
    und diese Zusage haelt fest, dass sie es weiter tut."""
    hier = open(os.path.abspath(__file__), encoding='utf-8').read()
    for name in ('check_coverage', 'check_shrink'):
        assert f'g.{name}(' in hier, (
            f'{name} wird von dieser Datei nicht mehr aufgerufen — dann steht '
            'sie wieder ohne jede Zusicherung da')


# ── check_proxy_karte_gegen_bestand (Befund 03.09.2026) ────────────────
#
# ANLASS: pokemonproxies.com hatte das Set M5 abgeraeumt. Die URL-Karte
# behielt die 79 toten Adressen, die ausgelieferten Kartendateien trugen
# sie mit — 79 kaputte Kartenbilder auf der Seite. Beide Dateien waren
# in sich schluessig, nur zueinander nicht mehr. Genau diese Fuge prueft
# S17b, und zwar ohne Netz.

def _proxy_lage(tmp_path, karten_urls, datei_inhalt):
    """Legt eine Mini-DATA-Ablage an und gibt die findings zurueck."""
    import json as _json
    (tmp_path / 'pokemonproxies_url_map.json').write_text(
        _json.dumps({'_meta': {'entry_count': len(karten_urls)},
                     'urls': karten_urls}), encoding='utf-8')
    (tmp_path / 'cards_chunk_standard.json').write_text(
        datei_inhalt, encoding='utf-8')
    return tmp_path


def test_kartendatei_zeigt_auf_unbekannte_proxy_url_ist_kritisch(g, tmp_path, monkeypatch):
    lebt = 'https://www.pokemonproxies.com/assets/6a-001-Heracross-AAAA.png'
    tot = 'https://www.pokemonproxies.com/assets/5a-001-Tropius-BBBB.png'
    _proxy_lage(tmp_path, {'M6_1': lebt},
                '[{"image_url":"%s"},{"image_url":"%s"}]' % (lebt, tot))
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.check_proxy_karte_gegen_bestand(findings)
    assert 'CRITICAL' in stufen(findings)
    assert tot in texte(findings)


def test_kartendatei_deckungsgleich_ist_still(g, tmp_path, monkeypatch):
    lebt = 'https://www.pokemonproxies.com/assets/6a-001-Heracross-AAAA.png'
    _proxy_lage(tmp_path, {'M6_1': lebt}, '[{"image_url":"%s"}]' % lebt)
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.check_proxy_karte_gegen_bestand(findings)
    assert findings == []


def test_karte_darf_mehr_kennen_als_gebraucht_wird(g, tmp_path, monkeypatch):
    """Der umgekehrte Fall ist harmlos und darf nicht anschlagen."""
    a = 'https://www.pokemonproxies.com/assets/6a-001-Heracross-AAAA.png'
    b = 'https://www.pokemonproxies.com/assets/6a-002-Surskit-CCCC.png'
    _proxy_lage(tmp_path, {'M6_1': a, 'M6_2': b}, '[{"image_url":"%s"}]' % a)
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.check_proxy_karte_gegen_bestand(findings)
    assert findings == []


def test_rohe_limitless_url_loest_nichts_aus(g, tmp_path, monkeypatch):
    """Der Rueckfall auf den japanischen Scan ist der gewollte Zustand
    fuer ein abgeraeumtes Set — er darf nicht als Fehler gelten."""
    lebt = 'https://www.pokemonproxies.com/assets/6a-001-Heracross-AAAA.png'
    roh = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_1_R_JP_LG.png'
    _proxy_lage(tmp_path, {'M6_1': lebt},
                '[{"image_url":"%s"},{"image_url":"%s"}]' % (lebt, roh))
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.check_proxy_karte_gegen_bestand(findings)
    assert findings == []


# ── Preiszuordnung nach Format getrennt (Regel 03.09.2026) ────────────
#
# ANLASS: die Meldung nannte 1213 unbestaetigte Preiszeilen. 1108 davon
# (91 %) lagen in ROTIERTEN Sets — Karten, die niemand mehr legal spielt.
# Eine Kennzahl, die zu 91 % aus Irrelevantem besteht, wird ueberblaettert,
# und dann faellt auch der relevante Rest nicht mehr auf. Betreiberregel:
# wichtig ist nur, dass aktuell legale Karten korrekt gezogen werden.

def _preislage(tmp_path, zeilen, aeltestes='TEF', ordnung=None):
    import json as _json
    (tmp_path / 'price_data.csv').write_text(
        'set,number,eur_price,mapping_status\n' +
        # Preise in Anfuehrungszeichen: sie tragen ein Dezimalkomma und
        # wuerden sonst die Spalte sprengen (genau das ist mir hier beim
        # ersten Anlauf passiert — mapping_status wurde zu '00').
        ''.join(f'{s},{n},"{p}",{m}\n' for s, n, p, m in zeilen), encoding='utf-8')
    (tmp_path / 'sets.json').write_text(
        _json.dumps(ordnung or {'ALT': 10, 'TEF': 139, 'PBL': 158}), encoding='utf-8')
    (tmp_path / 'format_window.json').write_text(
        _json.dumps({'oldest_legal_set': aeltestes}), encoding='utf-8')
    return tmp_path


def test_rotierte_sets_warnen_nicht(g, tmp_path, monkeypatch):
    _preislage(tmp_path, [('ALT', '1', '99,00', 'unverified')])
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.report_unverified_prices(findings)
    assert 'WARN' not in stufen(findings), \
        'eine rotierte Karte darf keine Warnung ausloesen'
    assert 'INFO' in stufen(findings), 'sie soll aber nachweisbar bleiben'


def test_legales_set_warnt(g, tmp_path, monkeypatch):
    _preislage(tmp_path, [('PBL', '1', '44,00', 'unverified')])
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.report_unverified_prices(findings)
    assert 'WARN' in stufen(findings)
    assert 'PBL 1' in texte(findings)


def test_die_warnung_zaehlt_nur_das_legale(g, tmp_path, monkeypatch):
    """Der Kern: die Zahl in der WARN-Zeile darf die rotierten nicht
    mitzaehlen — sonst ist sie wieder die alte 1213er-Zahl."""
    zeilen = [('ALT', str(i), '1,00', 'unverified') for i in range(20)]
    zeilen += [('TEF', '7', '9,00', 'unverified')]
    _preislage(tmp_path, zeilen)
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.report_unverified_prices(findings)
    warn = [t for s, t in findings if s == 'WARN']
    assert len(warn) == 1
    assert warn[0].startswith('1 Preiszeilen'), warn[0]
    assert '20 weitere' in texte(findings)


def test_ohne_formatfenster_wird_alles_gemeldet(g, tmp_path, monkeypatch):
    """Faellt die Grenze aus, lieber zu viel melden als still nichts."""
    import json as _json
    _preislage(tmp_path, [('ALT', '1', '9,00', 'unverified')])
    (tmp_path / 'format_window.json').write_text(_json.dumps({}), encoding='utf-8')
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.report_unverified_prices(findings)
    assert 'WARN' in stufen(findings)


def test_bestaetigte_zuordnung_schweigt(g, tmp_path, monkeypatch):
    _preislage(tmp_path, [('PBL', '1', '44,00', 'ok')])
    monkeypatch.setattr(g, 'DATA', str(tmp_path))
    findings = []
    g.report_unverified_prices(findings)
    assert findings == []
