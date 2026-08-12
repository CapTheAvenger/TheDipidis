"""No test may hardcode a path that only exists on one machine.

A test file with `ROOT = '/home/user/TheDipidis'` passes locally and dies
on the runner with FileNotFoundError at COLLECTION time — which aborts
the entire pytest run, not just that file. Three deploys went red for
that reason before anyone noticed, and the failure looks nothing like
its cause: the deploy log says "Python tests failed with exit code 2"
and names a path nobody recognises.

The repo root is always derivable from __file__; there is never a reason
to spell it out.
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SUSPECT = re.compile(r'["\'](/home/[^"\']+|/Users/[^"\']+|[A-Za-z]:\\\\[^"\']+)["\']')


def _source_files():
    for base in ('tests', 'scripts', 'backend'):
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, base)):
            dirnames[:] = [d for d in dirnames
                           if d not in ('__pycache__', 'node_modules', 'artifacts')]
            for name in filenames:
                if name.endswith(('.py', '.js')):
                    yield os.path.join(dirpath, name)


def test_no_machine_specific_absolute_paths():
    offenders = []
    for path in _source_files():
        if os.path.basename(path) == os.path.basename(__file__):
            continue
        with open(path, encoding='utf-8', errors='replace') as f:
            for lineno, line in enumerate(f, 1):
                stripped = line.strip()
                if stripped.startswith('#') or stripped.startswith('*'):
                    continue          # a comment or docstring may cite a path
                m = SUSPECT.search(line)
                if m:
                    offenders.append(f'{os.path.relpath(path, ROOT)}:{lineno}: {m.group(1)}')
    assert not offenders, (
        'absolute machine-specific paths would break on the CI runner:\n  '
        + '\n  '.join(offenders))
