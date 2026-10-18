"""Conftest racine — rend le code de backend/code python/ importable par les tests.

Les modules du pipeline (anonymize_log, transcribe_offline, correct_transcript,
deduplicate) vivent dans "backend/code python/". À l'exécution en script, Python
ajoute automatiquement le dossier du script au sys.path ; pour pytest, on l'ajoute ici.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "code python"))
