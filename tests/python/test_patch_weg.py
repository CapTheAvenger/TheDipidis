"""Der Patch-Weg (27.09.2026): scripts/patch_weg.py und sein Ablauf.

Die Zusicherungen FUEHREN verpacken/auspacken aus — geprueft wird das
Verhalten, nicht der Quelltext.
"""
import importlib.util
import json
import os
import re

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location('patch_weg', os.path.join(WURZEL, 'scripts', 'patch_weg.py'))
pw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pw)

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


def test_der_ablauf_wartet_auf_fertig_und_raeumt_vor_dem_einspielen_auf():
    yml = open(os.path.join(WURZEL, '.github', 'workflows', 'patch-einspielen.yml'), encoding='utf-8').read()
    ohne = re.sub(r'(?m)^\s*#.*$', '', yml)
    assert "branches: ['patch/**']" in ohne, 'der Ablauf darf nur auf patch/-Zweigen laufen'
    assert 'if [ "$rc" = "3" ]; then echo "bereit=nein"' in ohne
    rm, am = ohne.find('git rm -r -q .patch-einspielen'), ohne.find('git am --3way')
    assert 0 < rm < am, 'die Anlieferung muss vor dem Einspielen weg'
    assert 'git push origin "HEAD:${GITHUB_REF_NAME}"' in ohne
