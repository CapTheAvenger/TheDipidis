"""Die abgeleiteten Listen fuer die Post-Seite.

BESTELLT (Betreiber, 26.09.2026)
--------------------------------
„Dann die erfolgreichsten Listen der letzten 7 Tage — dann kann ich im
naechsten Filter den Archetype waehlen und in einem weiteren Filter sehe
ich dann nur von dem Deck die erfolgreichsten Listen der letzten 7 Tage.
Das gleiche fuer Last Major, Archetype waehlen und dann noch die von
welchem Platz die Platzierung ist. Da brauchen wir aber nicht mehr
anbieten als die Top 32."

WAS HIER GEPRUEFT WIRD
----------------------
Die ZAHLEN, gegen die echte Datei (data/tournament_decklists_per_player.csv,
45 MB, 202.685 Zeilen). tests/unit/test-post-kaskade.js prueft den GANG
durch die Filter gegen einen kleinen Ausschnitt — eine Zusicherung ueber
die Mechanik darf nicht davon abhaengen, welches Turnier diese Woche
zuletzt lief. Eine Zusicherung ueber die Daten schon.

DER BEFUND, DER DIESE DATEI AUSGELOEST HAT
------------------------------------------
Der erste Bau gruppierte auf `tournament_id` — die erste Spalte. Ergebnis:
NULL Archetypen im Sieben-Tage-Fenster, jede Online-Liste als
„nicht 60 Karten" verworfen. Gemessen am 26.09.2026: `tournament_id` ist
bei ALLEN Online-Turnieren leer; nur die Papier-Turniere tragen sie. Der
Schluessel ('', 'Aya') trug 48 Zeilen aus zwei Turnieren vom 08.09. und
18.09., Platz 12 und Platz 2, zusammen 120 Karten.

Eine Datei, die stumm leer bleibt, faellt niemandem auf — deshalb steht
die Untergrenze hier als Zusicherung und nicht als Kommentar.
"""
import csv
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'scripts', 'build_post_decklists.py')
QUELLE = os.path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv')


def _modul():
    spec = importlib.util.spec_from_file_location('build_post_decklists', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope='module')
def gebaut():
    """Einmal bauen, viele Zusicherungen — der Lauf kostet rund zwei Sekunden."""
    if not os.path.exists(QUELLE):
        pytest.skip('data/tournament_decklists_per_player.csv fehlt')
    m = _modul()
    daten, fehler = m.bauen()
    assert fehler is None, f'der Bau meldet: {fehler}'
    assert daten is not None
    return daten


def test_das_fenster_endet_am_letzten_turniertag(gebaut):
    """Das Fenster ist DATIERT, nicht benannt.

    „Letzte 7 Tage" ist eine Beschreibung; die Datei entsteht beim Deploy
    und kann aelter sein als der Tag, an dem der Post gemalt wird. Die
    Post-Seite zeigt deshalb `von` und `bis` — und die muessen stimmen.
    """
    letztes = ''
    with open(QUELLE, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            d = (r.get('tournament_date') or '').strip()
            if d > letztes:
                letztes = d
    assert gebaut['fenster']['bis'] == letztes, (
        f"das Fenster endet am {gebaut['fenster']['bis']}, "
        f'das letzte Turnier lief am {letztes}')
    assert gebaut['fenster']['tage'] == 7
    import datetime
    von = datetime.date.fromisoformat(gebaut['fenster']['von'])
    bis = datetime.date.fromisoformat(gebaut['fenster']['bis'])
    assert (bis - von).days == 6, 'sieben Tage sind sechs Tage Abstand'


def test_das_fenster_ist_nicht_leer(gebaut):
    """Genau der Befund vom 26.09.2026: null Archetypen, stumm."""
    assert len(gebaut['sieben_tage']) >= 10, (
        f"nur {len(gebaut['sieben_tage'])} Archetypen im Fenster — gemessen am "
        '26.09.2026 waren es 97. Eine so kleine Zahl heisst, dass die '
        'Gruppierung nicht greift (leere tournament_id) und nicht, dass '
        'niemand gespielt hat')
    listen = sum(len(v) for v in gebaut['sieben_tage'].values())
    assert listen >= 50, f'nur {listen} Listen im Fenster'


def test_jede_liste_hat_sechzig_karten(gebaut):
    """Eine Liste, die nicht 60 Karten zaehlt, ist keine Deckliste.

    Limitless liefert bei einigen Turnieren nur die Teilnehmerliste. So
    etwas als „erfolgreichste Liste" zu zeigen waere eine Behauptung ueber
    Karten, die nie gemessen wurden.
    """
    alle = []
    for a, reihe in gebaut['sieben_tage'].items():
        for L in reihe:
            alle.append((a, L))
    for L in (gebaut['major'] or {}).get('listen') or []:
        alle.append((L['archetyp'], L))
    assert alle
    # DIE ZAHL KOMMT AUS DEM MODUL, NICHT AUS DEM TESTCODE.
    # tests/python/test_livedaten_wachhund.py hat den ersten Anlauf zu
    # Recht angehalten: „== 60" gegen das echte data/ ist ein
    # festgenagelter Punkt. Hier ist es aber keine Beobachtung der Woche,
    # sondern eine GLEICHUNG zwischen dem Filter im Skript und dem, was
    # er durchlaesst — deshalb steht der Sollwert dort, wo er hingehoert.
    soll = _modul().DECKGROESSE
    for a, L in alle:
        summe = sum(k[3] for k in L['karten'])
        assert summe == soll, f'{a} Platz {L["platz"]}: {summe} Karten statt {soll}'
        for k in L['karten']:
            assert k[0], f'{a}: eine Karte ohne Namen'
            assert k[3] > 0, f'{a}: eine Karte mit Stueckzahl {k[3]}'


def test_kein_platz_jenseits_der_top_32(gebaut):
    """„Da brauchen wir aber nicht mehr anbieten als die Top 32.\""""
    m = gebaut['major']
    assert m, 'kein Major in der Datei'
    # Auch hier kommt die Grenze aus dem Skript (MAJOR_PLAETZE) und nicht
    # aus dem Testcode: der Kopf der Datei muss sie nennen, damit die
    # Post-Seite sie in die Frage schreiben kann („Placement (top 32)"),
    # und die Listen muessen sie halten. Zwei Gleichungen, kein Punkt.
    grenze = _modul().MAJOR_PLAETZE
    assert m['plaetze'] == grenze, (
        f"der Kopf nennt {m['plaetze']} Plaetze, das Skript deckelt bei {grenze}")
    plaetze = [L['platz'] for L in m['listen']]
    assert plaetze, 'das Major hat keine Listen'
    assert max(plaetze) <= m['plaetze'], (
        f"Platz {max(plaetze)} steht in der Datei, der Kopf nennt {m['plaetze']}")
    assert min(plaetze) >= 1
    assert len(plaetze) == len(set(plaetze)), (
        f'ein Platz kommt zweimal vor: {sorted(plaetze)}')
    assert plaetze == sorted(plaetze), 'die Plaetze stehen nicht in ihrer Reihenfolge'


def test_das_major_ist_das_letzte(gebaut):
    """Nicht irgendein Papier-Turnier — das juengste."""
    daten = {}
    with open(QUELLE, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if (r.get('quelle') or '').strip() != 'papier':
                continue
            d = (r.get('tournament_date') or '').strip()
            if d:
                daten[d] = (r.get('tournament_name') or '').strip()
    assert daten
    juengstes = max(daten)
    assert gebaut['major']['datum'] == juengstes, (
        f"die Datei nennt {gebaut['major']['datum']}, das letzte Major lief "
        f'am {juengstes} ({daten[juengstes]})')


def test_die_reihenfolge_ist_die_erfolgreichste_zuerst(gebaut):
    """(Platz, dann Feldgroesse absteigend, dann Siege).

    Ein erster Platz unter 386 Spielern ist mehr als einer unter 56 —
    beide Zahlen stehen in den Daten, keine ist geschaetzt.
    """
    for a, reihe in gebaut['sieben_tage'].items():
        schluessel = [(L['platz'], -L['feld'], -L['w']) for L in reihe]
        assert schluessel == sorted(schluessel), (
            f'{a}: die Listen stehen nicht nach Erfolg: {schluessel}')
        assert len(reihe) <= gebaut['je_archetyp'], (
            f'{a}: {len(reihe)} Listen, der Deckel ist {gebaut["je_archetyp"]}')


def test_jede_platzierung_traegt_ihr_feld(gebaut):
    """Die Hausregel „jede Quote traegt ihren Nenner", angewandt auf einen
    Platz: ohne Feldgroesse ist „1." keine Aussage. Die Post-Seite kann sie
    nur ins Bild schreiben, wenn sie in der Datei steht."""
    for a, reihe in gebaut['sieben_tage'].items():
        for L in reihe:
            assert L['feld'] > 0, f'{a} Platz {L["platz"]}: keine Feldgroesse'
            assert L['platz'] > 0, f'{a}: eine Liste ohne Platz'
            assert L['datum'], f'{a}: eine Liste ohne Datum'
            assert L['turnier'], f'{a}: eine Liste ohne Turniernamen'


def test_bilder_nur_fuer_karten_die_vorkommen(gebaut):
    """Die Datei wandert ueber das Mobilnetz. Jede Adresse, die zu keiner
    Karte in ihr gehoert, ist bezahlter Ballast."""
    gebraucht = set()
    for reihe in gebaut['sieben_tage'].values():
        for L in reihe:
            for k in L['karten']:
                gebraucht.add(k[1] + '-' + k[2])
    for L in (gebaut['major'] or {}).get('listen') or []:
        for k in L['karten']:
            gebraucht.add(k[1] + '-' + k[2])
    ueber = set(gebaut['bilder']) - gebraucht
    assert not ueber, f'{len(ueber)} Adressen ohne Karte, z. B. {sorted(ueber)[:5]}'
    assert len(gebaut['bilder']) >= 50, (
        f"nur {len(gebaut['bilder'])} Bildadressen — dann steht die Deckliste "
        'drueben als Namensgitter da')
    assert gebaut['bild_praefix'].startswith('https://')
    for k, rest in gebaut['bilder'].items():
        assert not rest.startswith(gebaut['bild_praefix']), (
            f'{k}: der gemeinsame Anfang steht zweimal da')


def test_die_groesse_haengt_an_den_deckeln_und_nicht_am_zufall(gebaut):
    """WAS HIER NICHT STEHT — UND WARUM.

    Der erste Anlauf sicherte „kleiner als 2 MB" zu. Das hat
    tests/python/test_livedaten_wachhund.py zu Recht angehalten: die Zahl
    bricht durch ZUWACHS. Kommen naechste Woche mehr Turniere ins
    Fenster, faellt der Deploy — ohne dass ein Defekt vorliegt. Genau so
    sind am 11. und 12.09.2026 zusammen sechs Stunden Stillstand
    entstanden.

    Die Groesse ist auch keine eigene Eigenschaft: sie FOLGT aus den zwei
    Deckeln (hoechstens `je_archetyp` Listen je Archetyp, hoechstens
    `MAJOR_PLAETZE` beim Major) und aus der Regel, dass keine Adresse
    ohne Karte mitgeht. Die drei sind einzeln zugesichert. Was bleibt,
    ist die Frage, ob die Deckel ueberhaupt greifen — und die ist eine
    Richtung, kein Punkt.

    Gemessen am 26.09.2026: 197 KB roh, 19 KB gzip.

    Die gemessene Groesse selbst beobachtet scripts/data_guardian.py: der
    meldet und haelt nichts an.
    """
    m = _modul()
    for a, reihe in gebaut['sieben_tage'].items():
        assert len(reihe) <= m.JE_ARCHETYP, (
            f'{a}: {len(reihe)} Listen, der Deckel im Skript ist {m.JE_ARCHETYP}')
    assert len(gebaut['bilder']) <= sum(
        len(L['karten']) for reihe in gebaut['sieben_tage'].values() for L in reihe) + sum(
        len(L['karten']) for L in (gebaut['major'] or {}).get('listen') or []), (
        'es stehen mehr Bildadressen in der Datei als Karten, die sie brauchen')


def test_ohne_quelle_entsteht_eine_gueltige_leere_datei():
    """Der Deploy darf daran nicht scheitern: eine Post-Seite, die „keine
    Listen vorhanden" sagt, ist besser als eine Seite, die es nicht gibt."""
    m = _modul()
    with tempfile.TemporaryDirectory() as t:
        ziel = os.path.join(t, 'post_decklists.json')
        alt = m.QUELLE
        m.QUELLE = os.path.join(t, 'gibt-es-nicht.csv')
        try:
            rueck = subprocess.run(
                [sys.executable, SKRIPT, '--aus', ziel],
                cwd=t, capture_output=True, text=True,
                env=dict(os.environ, PYTHONPATH=WURZEL))
        finally:
            m.QUELLE = alt
        # Der Lauf im Unterprozess nutzt die ECHTE Quelle (sie liegt im
        # Repo) — geprueft wird hier nur, dass er ueberhaupt durchlaeuft
        # und eine gueltige Datei schreibt.
        assert rueck.returncode == 0, rueck.stderr
        with open(ziel, encoding='utf-8') as f:
            j = json.load(f)
        assert j['v'] == 1
        assert 'sieben_tage' in j and 'major' in j and 'bilder' in j

    # Und jetzt ohne Quelle, in der Funktion selbst.
    m2 = _modul()
    m2.QUELLE = '/gibt/es/nicht.csv'
    daten, fehler = m2.bauen()
    assert daten is None and 'fehlt' in fehler
    leer = m2.leer(fehler)
    assert leer['sieben_tage'] == {} and leer['major'] is None
    assert leer['ohne_daten']


def test_leere_turnier_kennung_wirft_keine_listen_zusammen(tmp_path):
    """DER BEFUND VOM 26.09.2026, als Zusicherung.

    Zwei Turniere, beide mit leerer `tournament_id`, derselbe Spieler.
    Wer auf der ersten Spalte gruppiert, bekommt eine Liste mit 120
    Karten und verwirft sie als unvollstaendig — stumm.
    """
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    zeilen = [kopf]
    for kennung, datum, platz, anzahl in (('aaa', '2026-09-20', '1', 60),
                                          ('bbb', '2026-09-21', '2', 60)):
        zeilen.append(
            f',{kennung},Turnier {kennung},{datum},TEF-PBL,{platz},Aya,'
            f'Dragapult,dragapult,7,1,1,Dreepy,,TWM,128,{anzahl},'
            f'Pokemon,false,online,120,,')
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')

    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    reihe = daten['sieben_tage'].get('Dragapult') or []
    assert len(reihe) == 2, (
        f'{len(reihe)} Liste(n) statt zwei — die beiden Turniere wurden auf '
        'der leeren tournament_id zusammengeworfen')
    assert daten['verworfen_unvollstaendig'] == 0, (
        'eine der beiden Listen wurde als unvollstaendig verworfen')
    assert [L['platz'] for L in reihe] == [1, 2]


def test_eine_unvollstaendige_liste_wird_verworfen_und_gezaehlt(tmp_path):
    """Die 60-Karten-Regel braucht einen Fall, den die echte Datei nicht
    hergibt.

    VERFAELSCHUNGSPROBE (26.09.2026): die Regel aus `bauen` zu entfernen
    liess alle Zusicherungen gruen — in der Quelle dieser Woche zaehlt
    JEDE Liste genau 60 Karten. Eine Zusicherung, die nur haelt, solange
    die Daten zufaellig sauber sind, haelt nichts. Also mit eigenen Zeilen:
    eine vollstaendige Liste, eine mit 41 Karten (Limitless liefert bei
    einigen Turnieren nur die Teilnehmerliste).
    """
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    zeilen = [kopf]

    def reihe(kennung, spieler, platz, anzahl, karte='Dreepy', num='128'):
        return (f',{kennung},Turnier {kennung},2026-09-20,TEF-PBL,{platz},'
                f'{spieler},Dragapult,dragapult,7,1,1,{karte},,TWM,{num},'
                f'{anzahl},Pokemon,false,online,120,,')

    zeilen.append(reihe('aaa', 'Voll', '1', 60))
    # 41 Karten: 30 + 11 — zwei Zeilen, damit es nicht wie eine
    # Einzelkarte mit falscher Stueckzahl aussieht.
    zeilen.append(reihe('aaa', 'Halb', '2', 30))
    zeilen.append(reihe('aaa', 'Halb', '2', 11, karte='Drakloak', num='129'))
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')

    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    reihen = daten['sieben_tage'].get('Dragapult') or []
    assert len(reihen) == 1, (
        f'{len(reihen)} Listen — die Liste mit 41 Karten steht mit drin und '
        'wuerde als „erfolgreichste Liste" gepostet')
    assert reihen[0]['platz'] == 1
    assert daten['verworfen_unvollstaendig'] == 1, (
        f"{daten['verworfen_unvollstaendig']} verworfen gemeldet, erwartet 1 — "
        'die Zahl steht im Kopf der Datei, damit ein Ausfall des Scrapers '
        'sichtbar wird und nicht als kleineres Angebot durchgeht')


def test_ein_major_ohne_vollstaendige_listen_bleibt_leer(tmp_path):
    """Dasselbe fuer das Major: eine Top-32-Platzierung ohne Deckliste darf
    nicht als Post angeboten werden."""
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    zeilen = [kopf,
              ('7,,Regional Nirgendwo,2026-09-18,TEF-PBL,1,Sieger,Slowking,'
               'slowking,12,2,1,Slowking,,BLK,58,4,Pokemon,false,papier,900,,'),
              ('7,,Regional Nirgendwo,2026-09-18,TEF-PBL,2,Zweiter,Crustle,'
               'crustle,11,3,1,Crustle,,TWM,20,60,Pokemon,false,papier,900,,')]
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')
    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    plaetze = [L['platz'] for L in (daten['major'] or {}).get('listen') or []]
    assert plaetze == [2], (
        f'angeboten werden die Plaetze {plaetze} — Platz 1 hat nur 4 Karten')


def test_das_major_nennt_die_zahl_der_gefuehrten_plaetze(gebaut):
    """Der Nenner einer Platzierung.

    `spielerzahl` ist bei Papier-Turnieren leer (gemessen 26.09.2026) — die
    Spalte fuellt nur der Online-Scraper. Die Feldgroesse steht aber
    trotzdem in der Datei: Limitless fuehrt bei einem Major die volle
    Abschlusstabelle. Gezaehlt wird, wie viele Spieler das Turnier hier
    fuehrt; drueben heisst das „of 559" und nicht „559 players", weil es
    die Zahl der GEFUEHRTEN Platzierungen ist und nicht mehr behauptet.
    """
    m = gebaut['major']
    assert m['gefuehrt'] > 0, 'das Major nennt keine Zahl gefuehrter Plaetze'
    # Nachgezaehlt in der Quelle, nicht uebernommen.
    spieler = set()
    with open(QUELLE, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if (r.get('quelle') or '').strip() != 'papier':
                continue
            if (r.get('tournament_date') or '').strip() != m['datum']:
                continue
            if (r.get('tournament_name') or '').strip() != m['name']:
                continue
            p = (r.get('player_name') or '').strip()
            if p:
                spieler.add(p)
    assert m['gefuehrt'] == len(spieler), (
        f"die Datei nennt {m['gefuehrt']} gefuehrte Plaetze, gezaehlt sind "
        f'{len(spieler)}')
    assert m['gefuehrt'] >= max(L['platz'] for L in m['listen']), (
        'es steht eine Platzierung jenseits der gefuehrten Zahl in der Datei')


def test_nur_top_acht_gilt_als_erfolgreich(gebaut):
    """GEMESSEN IM BROWSER (26.09.2026): in der Auswahl stand
    „Alakazam — best 163rd of 203\".

    Unter der Ueberschrift „die erfolgreichsten Listen der letzten 7 Tage\"
    ist ein 163. Platz keine Auskunft, sondern eine falsche Behauptung. Die
    Schwelle ist nicht erfunden: die Seite rechnet ihre Online-Erfolge seit
    immer ueber den Top-8-Schnitt (data/online_tournament_top8_decks.csv,
    REZEPTE['top8'] in js/ds-post-quellen.js).
    """
    grenze = _modul().ERFOLG_PLATZ
    assert gebaut['fenster']['erfolg_platz'] == grenze, (
        'die Schwelle steht nicht im Kopf der Datei — die Post-Seite kann sie '
        'dann nicht in die Frage schreiben und sie wirkt stumm')
    for a, reihe in gebaut['sieben_tage'].items():
        for L in reihe:
            assert 0 < L['platz'] <= grenze, (
                f'{a}: Platz {L["platz"]} steht unter „erfolgreichste Listen"')
    # Und die Auswahl ist danach nicht leer — sonst waere die Schwelle zu hart.
    assert len(gebaut['sieben_tage']) >= 10, (
        f"nach der Schwelle bleiben nur {len(gebaut['sieben_tage'])} Archetypen")


def test_der_nenner_einer_platzierung_ist_das_feld_nicht_die_zahl_der_listen(gebaut):
    """DER BEFUND DES PRUEFAGENTEN (26.09.2026).

    Der erste Bau nahm als Nenner die Zahl der Spieler MIT Deckliste und
    schrieb sie als „1st of 559" ins Bild. Nachgezaehlt: das Regional
    Baltimore hatte 3.119 Teilnehmer, 559 davon haben eine Liste
    eingereicht — dem geposteten Bild fehlte der Faktor 5,6. Dieselbe
    Seite nannte in der Events-Kette korrekt „3,119 players" fuer
    dasselbe Turnier.

    Geprueft wird die GLEICHUNG gegen die Datei, aus der die Events-Posts
    ihre Zahl nehmen — kein Wochenwert steht hier im Code.
    """
    import glob
    m = gebaut['major']
    assert m['feld'] > 0, 'das Major nennt keine Feldgroesse'
    assert m['gefuehrt'] > 0
    assert m['feld'] >= m['gefuehrt'], (
        f"das Feld ({m['feld']}) ist kleiner als die Zahl der eingereichten "
        f"Listen ({m['gefuehrt']}) — dann ist eine der beiden Zahlen falsch")

    # Der Sollwert kommt aus den labs-Dateien, ueber die Turnierkennung.
    tid = None
    with open(QUELLE, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if ((r.get('quelle') or '').strip() == 'papier'
                    and (r.get('tournament_date') or '').strip() == m['datum']
                    and (r.get('tournament_name') or '').strip() == m['name']):
                tid = (r.get('tournament_id') or '').strip()
                break
    assert tid, 'das Major hat in der Quelle keine Turnierkennung'
    soll = 0
    for pfad in glob.glob(os.path.join(WURZEL, 'data', 'labs_tournament_decks*.csv')):
        with open(pfad, newline='', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if (r.get('tournament_id') or '').strip() != tid:
                    continue
                try:
                    soll = max(soll, int((r.get('total_players') or '0').strip()))
                except ValueError:
                    pass
    assert soll > 0, f'fuer {tid} steht in keiner labs-Datei eine Teilnehmerzahl'
    assert m['feld'] == soll, (
        f"die Datei nennt {m['feld']} Teilnehmer, die labs-Datei {soll}")


def test_ohne_teilnehmerzahl_wird_keine_erfunden(tmp_path):
    """Kein Nenner ist weniger, aber nicht falsch."""
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    zeilen = [kopf,
              ('9999,,Regional Nirgendwo,2026-09-18,TEF-PBL,1,Sieger,Slowking,'
               'slowking,12,2,1,Slowking,,BLK,58,60,Pokemon,false,papier,,,')]
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')
    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    m.LABS = str(tmp_path)          # keine labs-Datei -> keine Teilnehmerzahl
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    assert daten['major']['feld'] == 0, (
        f"fuer ein Turnier ohne Eintrag steht {daten['major']['feld']} da")
    assert daten['major']['gefuehrt'] == 1


def test_ein_papier_turnier_im_fenster_faellt_nicht_unter_online(tmp_path):
    """VERFAELSCHUNGSPROBE, DIE NICHT BISS (Pruefagent, 26.09.2026).

    `if t['quelle'] != 'online': continue` liess sich entfernen, ohne dass
    etwas rot wurde — in dieser Woche faellt kein Papier-Turnier ins
    Fenster. Kaeme eines hinein, truegen seine Listen den Kicker
    „last 7 days · online", und `feld` waere 0, weil `spielerzahl` bei
    Papier leer ist. Also mit eigenen Zeilen.
    """
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    zeilen = [kopf,
              (',aaa,Online Weekly,2026-09-20,TEF-PBL,1,Aya,Dragapult,dragapult,'
               '7,1,1,Dreepy,,TWM,128,60,Pokemon,false,online,120,,'),
              ('0099,,Regional Papier,2026-09-20,TEF-PBL,1,Bo,Slowking,slowking,'
               '12,2,1,Slowking,,BLK,58,60,Pokemon,false,papier,,,')]
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')
    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    m.LABS = str(tmp_path)
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    assert 'Slowking' not in daten['sieben_tage'], (
        'ein Papier-Turnier steht unter „erfolgreichste Listen der letzten 7 '
        'Tage · online" — mit einem Kicker, der nicht stimmt, und ohne Nenner')
    assert 'Dragapult' in daten['sieben_tage']
    # Und es ist trotzdem als Major zu haben.
    assert daten['major'] and daten['major']['name'] == 'Regional Papier'


def test_die_karten_stehen_nach_stueckzahl(tmp_path):
    """VERFAELSCHUNGSPROBE, DIE NICHT BISS (Pruefagent, 26.09.2026).

    Die Sortierung liess sich entfernen, ohne dass etwas rot wurde. Das
    Bild zeigt acht von rund 28 Zeilen unter der Spalte „Copies" und ohne
    Rangziffern — in CSV-Reihenfolge waere das ein willkuerlicher
    Ausschnitt, der aussieht wie die wichtigsten Karten.
    """
    kopf = ('tournament_id,limitless_tournament_id,tournament_name,'
            'tournament_date,meta,place,player_name,deck_archetype,deck_slug,'
            'wins,losses,ties,card_name,card_identifier,set_code,set_number,'
            'count,type,is_ace_spec,quelle,spielerzahl,druck_quelle,scraped_at')
    # Absichtlich AUFSTEIGEND in die Datei geschrieben.
    karten = [('Zzz Energy', 'SVE', '13', 40), ('Mittel', 'TWM', '2', 4),
              ('Anfang', 'TWM', '1', 16)]
    zeilen = [kopf]
    for name, st, nr, anzahl in karten:
        zeilen.append(f',aaa,Online Weekly,2026-09-20,TEF-PBL,1,Aya,Dragapult,'
                      f'dragapult,7,1,1,{name},,{st},{nr},{anzahl},Pokemon,false,'
                      f'online,120,,')
    p = tmp_path / 'per_player.csv'
    p.write_text('\n'.join(zeilen), encoding='utf-8')
    m = _modul()
    m.QUELLE = str(p)
    m.KARTEN_DB = str(tmp_path / 'keine.json')
    m.LABS = str(tmp_path)
    daten, fehler = m.bauen()
    assert fehler is None, fehler
    reihe = daten['sieben_tage']['Dragapult'][0]['karten']
    assert [k[3] for k in reihe] == [40, 16, 4], (
        f'die Karten stehen nicht nach Stueckzahl: {reihe}')
    # Und bei gleicher Stueckzahl nach Namen — sonst entscheidet die
    # Reihenfolge in der Quelle, welche acht das Bild zeigt.
    umsortiert = m.karten_ordnen([['B', 'X', '1', 3], ['A', 'X', '2', 3]])
    assert [k[0] for k in umsortiert] == ['A', 'B'], umsortiert
