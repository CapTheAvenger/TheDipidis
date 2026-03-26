import os
from pathlib import Path

# Basisverzeichnis des Projekts (z.B. .../Hausi´s Pokemon TCG Analysis)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Zentrale Daten- und Config-Pfade
DATA_DIR = PROJECT_ROOT / "data"
CONFIG_DIR = PROJECT_ROOT / "config"


def get_data_path(filename: str) -> Path:
    """Gibt den absoluten Pfad zu einer Datei im data-Ordner zurück."""
    return DATA_DIR / filename


def get_config_path(filename: str) -> Path:
    """Gibt den absoluten Pfad zu einer Datei im config-Ordner zurück."""
    return CONFIG_DIR / filename
