"""Security guard: the default internal key must never be used on Render."""
import pytest

from config import Settings, assert_secure_config


def test_rejects_default_key_on_render():
    settings = Settings(internal_api_key="dev-internal-key")
    with pytest.raises(RuntimeError):
        assert_secure_config(settings, on_render=True)


def test_allows_strong_key_on_render():
    settings = Settings(internal_api_key="a-strong-random-secret-value")
    # Should not raise.
    assert_secure_config(settings, on_render=True)


def test_allows_default_key_off_render():
    settings = Settings(internal_api_key="dev-internal-key")
    # Local/dev (not on Render) tolerates the default.
    assert_secure_config(settings, on_render=False)
