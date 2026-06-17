"""Configuration pytest — fixe les variables d'environnement pour les tests."""
import os
import pytest


@pytest.fixture(autouse=True)
def set_dummy_gemini_key(monkeypatch):
    """Pose une clé Gemini factice pour que _load_api_key() retourne une valeur non-None.

    Les tests qui mockent _make_client n'appellent jamais l'API réelle.
    Les tests qui testent l'absence de clé patchent _load_api_key directement,
    ce qui écrase cette fixture.
    """
    if not os.getenv("GEMINI_API_KEY"):
        monkeypatch.setenv("GEMINI_API_KEY", "test-dummy-key")
