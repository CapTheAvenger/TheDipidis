"""Impressum und Datenschutzerklaerung — und der Riegel davor.

BEFUND (12.09.2026)
-------------------
Die Seite fuehrt Konten mit E-Mail und Passwort ueber Firebase Auth und
speichert Decks, Tauschlisten und Kampftagebuecher in Cloud Firestore.
Ein Impressum (§ 5 DDG) und eine Datenschutzerklaerung (DSGVO Art. 13)
gab es nicht. Offen stand das seit dem 18.08.2026 in vier Dokumenten,
danach hat es niemand mehr erwaehnt.

DER RIEGEL
----------
Drei Angaben koennen nur vom Betreiber kommen: Name, ladungsfaehige
Anschrift, Kontakt-E-Mail. Bis sie eingetragen sind, liefert
`deploy-pages.yml` beide Seiten NICHT aus — der Schritt sucht nach
`BITTE_EINTRAGEN` und ueberspringt die Datei, solange es vorkommt.

Das ist Absicht und keine Bequemlichkeit: ein unvollstaendiges
Impressum im Netz ist abmahnfaehig, eine fehlende Seite auf einer noch
nicht beworbenen Seite ist das kleinere Risiko. Sobald die Platzhalter
weg sind, geht beides beim naechsten Deploy von selbst live.
"""
import os
import re

WURZEL = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
DEPLOY = os.path.join(WURZEL, '.github', 'workflows', 'deploy-pages.yml')
SEITEN = ('impressum.html', 'datenschutz.html')
PLATZHALTER = 'BITTE_EINTRAGEN'


def _lies(name):
    return open(os.path.join(WURZEL, name), encoding='utf-8').read()


def test_beide_seiten_gibt_es():
    fehlt = [n for n in SEITEN
             if not os.path.exists(os.path.join(WURZEL, n))]
    assert not fehlt, 'Rechtsseiten fehlen: ' + ', '.join(fehlt)


def test_der_deploy_haelt_platzhalter_zurueck():
    """Ohne den Riegel geht ein halbes Impressum live — schlimmer als keins."""
    y = open(DEPLOY, encoding='utf-8').read()
    assert PLATZHALTER in y, (
        'deploy-pages.yml prueft die Rechtsseiten nicht mehr auf '
        'Platzhalter — ein unvollstaendiges Impressum wuerde ausgeliefert')
    for name in SEITEN:
        assert name in y, f'{name} kommt im Deploy gar nicht vor'


def test_der_riegel_faellt_von_selbst_wenn_die_daten_stehen():
    """Er darf kein Dauerhindernis sein, sonst traegt niemand etwas ein."""
    y = open(DEPLOY, encoding='utf-8').read()
    assert re.search(r'grep -q "?' + PLATZHALTER + r'"?', y), (
        'der Riegel prueft nicht mehr auf den Platzhalter')
    assert re.search(r'\n\s*cp "\$seite" _site/', y), (
        'ohne Platzhalter muss die Datei ausgeliefert werden — sonst '
        'bleibt sie fuer immer unten')


def test_die_seiten_nennen_die_wirklich_benutzten_dienste():
    """Eine Erklaerung, die etwas anderes beschreibt als die Seite tut,
    ist schlechter als keine: sie sieht richtig aus."""
    ds = _lies('datenschutz.html')
    fuer_jeden = [
        ('Firebase', 'Konten laufen ueber Firebase Auth'),
        ('Firestore', 'Decks liegen in Cloud Firestore'),
        ('GitHub', 'gehostet auf GitHub Pages'),
        ('Art. 6', 'ohne Rechtsgrundlage ist es keine Erklaerung'),
        ('Art. 15', 'Auskunftsrecht fehlt'),
        ('Art. 77', 'Beschwerderecht bei der Aufsichtsbehoerde fehlt'),
        ('localStorage', 'der lokale Speicher wird benutzt und gehoert genannt'),
    ]
    fehlt = [f'{w} ({warum})' for w, warum in fuer_jeden if w not in ds]
    assert not fehlt, 'in datenschutz.html fehlt: ' + '; '.join(fehlt)

    imp = _lies('impressum.html')
    assert 'DDG' in imp, '§ 5 DDG ist die Grundlage und gehoert genannt'
    assert 'Pokémon Company' in imp or 'Pokemon Company' in imp, (
        'der Hinweis auf die Rechteinhaber und die fehlende Verbindung '
        'zu ihnen gehoert ins Impressum')


def test_die_erklaerung_beschreibt_die_schriften_so_wie_sie_sind():
    """Der teuerste Fehler waere hier eine Aussage, die nicht zur Seite passt.

    Eine falsche Datenschutzerklaerung ist schlechter als eine
    unangenehme richtige: sie sieht richtig aus. Diese Pruefung haelt
    deshalb BEIDE Richtungen fest und zwingt dazu, den Absatz
    nachzuziehen, sobald die Schrift umgezogen ist.

    Die erste Fassung suchte den Satz als eine Zeile und war gruen,
    obwohl die Behauptung falsch war — im HTML steht er ueber zwei
    Zeilen. Deshalb wird hier Leerraum normalisiert.
    """
    ds = re.sub(r'\s+', ' ', _lies('datenschutz.html'))
    index = _lies('index.html')
    laedt_extern = 'fonts.googleapis.com/css2' in index
    sagt_extern = ('wird derzeit noch über' in ds
                   and 'fonts.googleapis.com' in ds)
    sagt_lokal = 'auf unserem eigenen Server' in ds and 'keine Verbindung' in ds

    if laedt_extern:
        assert sagt_extern, (
            'index.html laedt die Schrift von fonts.googleapis.com, die '
            'Datenschutzerklaerung sagt das aber nicht. Entweder den '
            'Absatz zuruecknehmen oder den Ablauf "Schriften spiegeln" '
            'laufen lassen und index.html umstellen.')
        assert not sagt_lokal, (
            'Die Erklaerung behauptet, die Schrift liege lokal — '
            'index.html laedt sie weiter bei Google.')
    else:
        assert not sagt_extern, (
            'Die Schrift liegt lokal, die Erklaerung behauptet aber '
            'weiter einen Abruf bei Google. Absatz nachziehen.')
        assert sagt_lokal, (
            'Die Schrift liegt lokal, die Erklaerung sagt es nicht. Das '
            'ist die gute Nachricht, und sie gehoert hinein.')
