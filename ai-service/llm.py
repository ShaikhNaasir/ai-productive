"""Thin wrapper around the Anthropic Messages API.

Kept small and side-effect free so tests can monkeypatch `complete_text`
without any network access. Raises `LLMUnavailable` when no API key is set,
which callers translate into a graceful 503.
"""
import json
import re
from typing import Optional

from config import get_settings


class LLMUnavailable(RuntimeError):
    """Raised when the LLM backend is not configured or reachable."""


_client = None


def _get_client():
    global _client
    settings = get_settings()
    if not settings.anthropic_enabled:
        raise LLMUnavailable("ANTHROPIC_API_KEY is not configured")
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def complete_text(system: str, user: str, model: Optional[str] = None, max_tokens: int = 1024) -> str:
    """Return the assistant's text response for a single-turn prompt."""
    settings = get_settings()
    client = _get_client()
    resp = client.messages.create(
        model=model or settings.anthropic_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")


def _extract_json(text: str) -> str:
    """Pull a JSON object out of a model response that may include code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    braces = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if braces:
        return braces.group(1)
    return text


def complete_json(system: str, user: str, model: Optional[str] = None, max_tokens: int = 1024) -> dict:
    """Ask the model for JSON and parse it. Raises ValueError on unparseable output."""
    raw = complete_text(system=system, user=user, model=model, max_tokens=max_tokens)
    try:
        return json.loads(_extract_json(raw))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {raw[:200]}") from exc
