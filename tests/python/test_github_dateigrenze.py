"""Wochenlauf #196 (03.11.2026): Tor gruen, Push dreimal abgelehnt — eine
Datei ueber GitHubs 100-MiB-Grenze (data/tournament_decklists_per_player.csv,
106,51 MB), und der Ablauf verwarf den ganzen Wochenstand.

Regel: eine zu grosse Datei geht VOR dem Tor auf den Stand von main
zurueck und wird benannt; alles andere bleibt frisch. Gebauter Fall in
einem Wegwerf-Repo mit kleiner Grenze."""
import importlib.util
import io
import os
import subprocess
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'scripts', 'github_dateigrenze.py')
ABLAUF = os.path.join(WURZEL, '.github', 'workflows', 'weekly-full-update.yml')


def _modul():
    spec = importlib.util.spec_from_file_location('github_dateigrenze', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _repo(tmp_path):
    subprocess.run(['git', 'init', '-q', str(tmp_path)], check=True)
    d = tmp_path / 'data'
    d.mkdir()
    (d / 'gross.csv').write_text('alt\n', encoding='utf-8')
    (d / 'klein.csv').write_text('alt\n', encoding='utf-8')
    subprocess.run(['git', '-C', str(tmp_path), 'add', '-A'], check=True)
    subprocess.run(['git', '-C', str(tmp_path), '-c', 'user.name=t', '-c', 'user.email=t@t',
                    'commit', '-q', '-m', 'basis'], check=True)
    return d


def test_zu_grosse_datei_geht_zurueck_der_rest_bleibt_frisch(tmp_path, monkeypatch, capsys):
    d = _repo(tmp_path)
    (d / 'gross.csv').write_text('x' * 5000, encoding='utf-8')     # frisch, zu gross
    (d / 'klein.csv').write_text('frisch\n', encoding='utf-8')      # frisch, klein
    (d / 'neu_gross.csv').write_text('y' * 5000, encoding='utf-8')  # neu, zu gross
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('GITHUB_DATEIGRENZE_BYTES', '1000')
    m = _modul()
    assert m.main(['x', 'data']) == 0, 'der Lauf darf daran nicht rot werden'
    out = capsys.readouterr().out
    assert (d / 'gross.csv').read_text(encoding='utf-8') == 'alt\n', (
        'die zu grosse Datei steht nicht auf dem Stand von main — der Push '
        'scheitert dann wie in #196 am pre-receive-Hook')
    assert (d / 'klein.csv').read_text(encoding='utf-8') == 'frisch\n', (
        'eine kleine Datei wurde mit zurueckgesetzt — genau der Fehler, den '
        'der Ablauf bis #196 machte (alles verworfen)')
    assert not (d / 'neu_gross.csv').exists(), 'eine neue zu grosse Datei bleibt liegen'
    assert out.count('::error::') == 2 and 'gross.csv' in out and 'neu_gross.csv' in out, (
        'das Zuruecksetzen wird nicht benannt — stilles Reparieren')


def test_ohne_treffer_passiert_nichts(tmp_path, monkeypatch, capsys):
    d = _repo(tmp_path)
    (d / 'gross.csv').write_text('frisch\n', encoding='utf-8')
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('GITHUB_DATEIGRENZE_BYTES', '1000')
    assert _modul().main(['x', 'data']) == 0
    assert (d / 'gross.csv').read_text(encoding='utf-8') == 'frisch\n'
    assert '::error::' not in capsys.readouterr().out


def test_die_grenze_ist_githubs_grenze():
    m = _modul()
    assert m.GRENZE == 100 * 1024 * 1024


def test_der_schritt_laeuft_vor_dem_tor():
    text = io.open(ABLAUF, encoding='utf-8').read()
    schritt = text.find('github_dateigrenze.py data')
    tor = text.find('name: Zusicherungen gegen die frischen Daten')
    assert 0 < schritt < tor, (
        'der Schritt fehlt oder liegt hinter dem Tor — dann prueft das Tor '
        'einen Stand, der nie gepusht werden kann')
