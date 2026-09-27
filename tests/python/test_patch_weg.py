"""Der Patch-Weg (27.09.2026): scripts/patch_weg.py und sein Ablauf.

Die Zusicherungen FUEHREN verpacken/auspacken aus — geprueft wird das
Verhalten, nicht der Quelltext.
"""
import importlib.util
import json
import os
import re
import shutil
import subprocess

import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location('patch_weg', os.path.join(WURZEL, 'scripts', 'patch_weg.py'))
pw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pw)
ABLAUF = os.path.join(WURZEL, '.github', 'workflows', 'patch-einspielen.yml')

# Was ein echter Patch mitbringt: Leerzeichen am Zeilenende (Kontextzeile
# einer leeren Codezeile, Signatur "-- "), Umlaute, kein Zeilenende am Schluss.
PATCH = ('From abc Mon Sep 17 00:00:00 2001\n'
         'Subject: [PATCH] Umlaute äöü — und Pokémon\n'
         '\n'
         '@@ -1,3 +1,3 @@\n'
         ' \n'
         '-alt\n'
         '+neu  \n'
         '-- \n'
         '2.43.0\n') * 40 + 'ohne Zeilenende'


def _verpackt(tmp_path, teil=500):
    quelle = tmp_path / 'a.patch'
    quelle.write_bytes(PATCH.encode('utf-8'))
    ordner = tmp_path / 'lieferung'
    liste = pw.verpacken(str(quelle), str(ordner), teil)
    return ordner, liste


def test_rundreise_ist_bytegleich(tmp_path):
    ordner, liste = _verpackt(tmp_path)
    assert len(liste['teile']) > 3, 'der Test soll mehrere Teile pruefen'
    aus = tmp_path / 'aus.patch'
    assert pw.auspacken(str(ordner), str(aus)) == 0
    assert aus.read_bytes() == PATCH.encode('utf-8')


def test_jede_zeile_traegt_die_endmarke(tmp_path):
    ordner, liste = _verpackt(tmp_path)
    for name in liste['teile']:
        for z in (ordner / name).read_text(encoding='utf-8').split('\n')[:-1]:
            assert z.endswith('|'), repr(z)


def test_ein_veraenderter_teil_wird_benannt(tmp_path, capsys):
    ordner, _ = _verpackt(tmp_path)
    p = ordner / 'teil-02.txt'
    # Genau das, was ein Editor unterwegs tut: Leerzeichen vor der Marke weg.
    p.write_bytes(p.read_bytes().replace(b'neu  |', b'neu|', 1))
    assert pw.auspacken(str(ordner), str(tmp_path / 'x')) == 1
    assert 'teil-02.txt' in capsys.readouterr().out
    assert not (tmp_path / 'x').exists()


def test_ein_fehlender_teil_wird_benannt(tmp_path, capsys):
    ordner, _ = _verpackt(tmp_path)
    (ordner / 'teil-03.txt').unlink()
    assert pw.auspacken(str(ordner), str(tmp_path / 'x')) == 1
    assert 'teil-03.txt' in capsys.readouterr().out


def test_ohne_fertig_liste_ist_die_lieferung_unterwegs(tmp_path):
    ordner, _ = _verpackt(tmp_path)
    (ordner / 'FERTIG.json').unlink()
    assert pw.auspacken(str(ordner), str(tmp_path / 'x')) == 3


def test_die_gesamtpruefsumme_greift_auch_bei_stimmigen_teilen(tmp_path):
    ordner, _ = _verpackt(tmp_path)
    liste = json.loads((ordner / 'FERTIG.json').read_text(encoding='utf-8'))
    liste['patch_sha256'] = '0' * 64
    (ordner / 'FERTIG.json').write_text(json.dumps(liste), encoding='utf-8')
    assert pw.auspacken(str(ordner), str(tmp_path / 'x')) == 1


def test_ein_schraegstrich_u_reist_maskiert_und_kommt_woertlich_an(tmp_path):
    """Gemessen 27.09.2026: ein woertliches Schraegstrich-u2026 aus js/i18n.js
    kam auf dem MCP-Weg als Auslassungszeichen an. In den Teilen darf es
    deshalb nicht stehen — im zusammengesetzten Patch muss es wieder stehen."""
    su = chr(92) + 'u'
    quelle = tmp_path / 'b.patch'
    roh = ("+    'arc.loading': 'Lade " + su + "2026',\n") * 30
    quelle.write_bytes(roh.encode('utf-8'))
    liste = pw.verpacken(str(quelle), str(tmp_path / 'l'), 300)
    assert liste.get('flucht') is True
    for name in liste['teile']:
        assert su not in (tmp_path / 'l' / name).read_text(encoding='utf-8'), name
    assert pw.auspacken(str(tmp_path / 'l'), str(tmp_path / 'aus')) == 0
    assert (tmp_path / 'aus').read_bytes() == roh.encode('utf-8')


def test_ab_hundert_teilen_stimmt_die_reihenfolge(tmp_path):
    """WZ-10: nach Namen sortiert stand teil-100 hinter teil-10."""
    quelle = tmp_path / 'c.patch'
    roh = ''.join(f'+Zeile {i:05d}\n' for i in range(1200))
    quelle.write_bytes(roh.encode('utf-8'))
    liste = pw.verpacken(str(quelle), str(tmp_path / 'l'), 100)
    assert len(liste['teile']) >= 100, len(liste['teile'])
    assert pw.auspacken(str(tmp_path / 'l'), str(tmp_path / 'aus')) == 0
    assert (tmp_path / 'aus').read_bytes() == roh.encode('utf-8')


def test_ohne_schraegstrich_u_bleibt_alles_wie_es_ist(tmp_path):
    ordner, liste = _verpackt(tmp_path)
    assert 'flucht' not in liste


def test_der_ablauf_laeuft_nur_auf_patch_zweigen():
    """Das ist wirklich Text: die Ausloeseregel wird nicht ausgefuehrt."""
    wf = yaml.safe_load(open(ABLAUF, encoding='utf-8'))
    ausloeser = wf.get('on', wf.get(True))
    assert ausloeser['push']['branches'] == ['patch/**'], 'der Ablauf darf nur auf patch/-Zweigen laufen'


# ── WZ-11 (28.09.2026): den Ablauf AUSFUEHREN statt lesen ──────────────
#
# Die fruehere Zusicherung suchte vier Textstellen. Der Abnahmeagent hat am
# 27.09.2026 fuenf Verfaelschungen probiert, vier blieben gruen, darunter
# ein zusaetzliches `git push origin HEAD:main` und `git am --skip`.
# Jetzt laufen die `run:`-Schritte der Datei in einem Wegwerf-Repo gegen
# einen lokalen Wegwerf-Ursprung, und geprueft wird, was danach DORT steht.

def _git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def _schritte():
    wf = yaml.safe_load(open(ABLAUF, encoding='utf-8'))
    return [s for s in wf['jobs']['einspielen']['steps'] if 'run' in s]


def _fuehre_ablauf_aus(tmp_path, mit_fertig=True, konflikt=False):
    ursprung = tmp_path / 'ursprung.git'
    arbeit = tmp_path / 'arbeit'
    _git(tmp_path, 'init', '-q', '--bare', '-b', 'main', str(ursprung))
    _git(tmp_path, 'clone', '-q', str(ursprung), str(arbeit))
    for k, v in (('user.name', 'T'), ('user.email', 't@t')):
        _git(arbeit, 'config', k, v)
    (arbeit / 'scripts').mkdir()
    shutil.copy(os.path.join(WURZEL, 'scripts', 'patch_weg.py'), arbeit / 'scripts' / 'patch_weg.py')
    (arbeit / 'datei.txt').write_text('alt\n', encoding='utf-8')
    _git(arbeit, 'add', '-A'); _git(arbeit, 'commit', '-q', '-m', 'Basis'); _git(arbeit, 'push', '-q', 'origin', 'main')
    main_vorher = _git(arbeit, 'rev-parse', 'HEAD')
    # Der Patch: ein echter Commit, als format-patch.
    _git(arbeit, 'checkout', '-q', '-b', 'bau')
    (arbeit / 'datei.txt').write_text('neu\n', encoding='utf-8')
    _git(arbeit, 'commit', '-q', '-am', 'Die Aenderung')
    patch = subprocess.run(['git', 'format-patch', '-1', '--stdout'], cwd=arbeit, check=True,
                           capture_output=True).stdout
    (tmp_path / 'x.patch').write_bytes(patch)
    _git(arbeit, 'checkout', '-q', 'main'); _git(arbeit, 'branch', '-q', '-D', 'bau')
    # Die Anlieferung auf dem Zweig patch/probe.
    _git(arbeit, 'checkout', '-q', '-b', 'patch/probe')
    if konflikt:
        # Der Zweig traegt schon eine andere Fassung derselben Zeile.
        (arbeit / 'datei.txt').write_text('anders\n', encoding='utf-8')
    pw.verpacken(str(tmp_path / 'x.patch'), str(arbeit / '.patch-einspielen'), 200)
    if not mit_fertig:
        (arbeit / '.patch-einspielen' / 'FERTIG.json').unlink()
    _git(arbeit, 'add', '-A'); _git(arbeit, 'commit', '-q', '-m', 'Anlieferung')
    _git(arbeit, 'push', '-q', 'origin', 'patch/probe')
    anlieferung = _git(arbeit, 'rev-parse', 'HEAD')

    ausgabe = tmp_path / 'github_output'
    ausgabe.write_text('', encoding='utf-8')
    umgebung = dict(os.environ, GITHUB_OUTPUT=str(ausgabe), GITHUB_REF_NAME='patch/probe')
    ausgaben = {}
    for schritt in _schritte():
        bedingung = schritt.get('if')
        if bedingung:
            m = re.fullmatch(r"steps\.(\w+)\.outputs\.(\w+) == '(\w+)'", bedingung.strip())
            assert m, f'unbekannte Bedingung im Ablauf: {bedingung}'
            if ausgaben.get((m.group(1), m.group(2))) != m.group(3):
                continue
        vor = ausgabe.read_text(encoding='utf-8')
        erg = subprocess.run(['bash', '-e', '-c', schritt['run']], cwd=arbeit, env=umgebung,
                             capture_output=True, text=True)
        if erg.returncode != 0:
            if konflikt:
                return dict(rot=schritt.get('name'), ursprung=ursprung, anlieferung=anlieferung,
                            refs=_refs(ursprung), main_vorher=main_vorher)
            raise AssertionError(f"Schritt {schritt.get('name')} rot:\n{erg.stdout}\n{erg.stderr}")
        for zeile in ausgabe.read_text(encoding='utf-8')[len(vor):].splitlines():
            k, _, v = zeile.partition('=')
            ausgaben[(schritt.get('id'), k)] = v
    return dict(rot=None, ursprung=ursprung, refs=_refs(ursprung), main_vorher=main_vorher, anlieferung=anlieferung)


def _refs(ursprung):
    return dict(reversed(z.split()) for z in
                _git(ursprung, 'for-each-ref', '--format=%(objectname) %(refname)').splitlines())


def test_der_ablauf_spielt_ein_und_beruehrt_nur_den_eigenen_zweig(tmp_path):
    e = _fuehre_ablauf_aus(tmp_path)
    assert set(e['refs']) == {'refs/heads/main', 'refs/heads/patch/probe'}, f"neue Zweige im Ursprung: {sorted(e['refs'])}"
    assert e['refs']['refs/heads/main'] == e['main_vorher'], 'der Ablauf hat main veraendert'
    spitze = e['refs']['refs/heads/patch/probe']
    u = str(e['ursprung'])
    assert _git(u, 'show', f'{spitze}:datei.txt') == 'neu', 'die Aenderung aus dem Patch ist nicht auf dem Zweig'
    assert _git(u, 'log', '-1', '--format=%s', spitze) == 'Die Aenderung', 'die Spitze ist nicht der eingespielte Commit'
    assert _git(u, 'log', '-1', '--format=%s', f'{spitze}~1') == 'Patch-Weg: Anlieferung entfernt'
    assert _git(u, 'rev-parse', f'{spitze}~2') == e['anlieferung'], 'der Zweig wurde umgeschrieben statt fortgesetzt'
    baum = _git(u, 'ls-tree', '-r', '--name-only', spitze).splitlines()
    assert not [p for p in baum if p.startswith('.patch-einspielen/')], 'die Anlieferung liegt noch im Baum'


def test_ohne_fertig_liste_tut_der_ablauf_nichts(tmp_path):
    e = _fuehre_ablauf_aus(tmp_path, mit_fertig=False)
    assert e['refs']['refs/heads/patch/probe'] == e['anlieferung']
    assert e['refs']['refs/heads/main'] == e['main_vorher']


def test_ein_patch_der_nicht_passt_macht_den_lauf_rot_und_schreibt_nichts(tmp_path):
    """Kein `git am --skip`, kein stilles Weiterlaufen: passt der Patch nicht,
    bleibt der Zweig auf der Anlieferung stehen und der Lauf ist rot."""
    e = _fuehre_ablauf_aus(tmp_path, konflikt=True)
    assert e['rot'], 'der Lauf blieb gruen, obwohl der Patch nicht passt'
    assert e['refs']['refs/heads/patch/probe'] == e['anlieferung'], 'trotz Konflikt wurde etwas auf den Zweig geschoben'
    assert e['refs']['refs/heads/main'] == e['main_vorher']
