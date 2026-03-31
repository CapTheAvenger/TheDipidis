"""Shared fixtures for Python backend unit tests."""
import os
import sys
import pytest

# Ensure project root is on PYTHONPATH so `backend.*` imports resolve
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture
def mock_card_db():
    """Lightweight CardDatabaseLookup stub (no file I/O)."""
    from unittest.mock import MagicMock

    db = MagicMock()
    db.normalize_name = lambda n: ' '.join(n.strip().lower().replace("'", "").replace("`", "").replace("\u2019", "").replace("-", " ").replace(".", "").split())
    db.cards = {}
    db.SET_ORDER = {'SVI': 100, 'PAL': 110, 'OBF': 120, 'MEW': 130, 'PAR': 140,
                    'TEF': 150, 'TWM': 160, 'SCR': 170, 'SVP': 90, 'MEP': 80}

    def _get_card(set_code, number):
        return {'rarity': 'Uncommon', 'type': 'Basic', 'image_url': f'https://img/{set_code}/{number}.png'}
    db.get_card = _get_card

    def _get_card_info(name):
        return {'set_code': 'SVI', 'number': '1', 'rarity': 'Common', 'type': 'Basic', 'image_url': ''}
    db.get_card_info = _get_card_info

    def _get_latest_low_rarity_version(name):
        class C:
            def __init__(self):
                self.name = name
                self.set_code = 'SVI'
                self.number = '1'
                self.rarity = 'Common'
                self.supertype = 'Pokemon'
        return C()
    db.get_latest_low_rarity_version = _get_latest_low_rarity_version

    db.is_ace_spec_by_name = lambda n: False
    db.get_card_type = lambda n: 'Pokemon'
    db.is_trainer_or_energy = lambda n: False
    db.is_valid_card = lambda n: True

    return db
