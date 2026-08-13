"""Provider-agnostic LLM wrapper.

Supports Anthropic, OpenAI, and Google Gemini — whichever key is configured
(see `config.active_provider`). Kept small and side-effect free so tests can
monkeypatch `complete_text` without any network access. Raises `LLMUnavailable`
when no provider is configured, which callers translate into a graceful 503.
"""
import json
import re
from contextvars import ContextVar
from typing import Optional

from config import get_settings


class LLMUnavailable(RuntimeError):
    """Raised when no LLM provider is configured or reachable."""


# Per-request token usage of the last LLM call, so endpoints can report it back
# to the server via response headers without changing any response body/schema.
_last_usage: ContextVar[Optional[dict]] = ContextVar("last_usage", default=None)


def reset_usage() -> None:
    _last_usage.set(None)


def set_last_usage(input_tokens: int, output_tokens: int, model: str) -> None:
    _last_usage.set({"input_tokens": int(input_tokens), "output_tokens": int(output_tokens), "model": model})


def get_last_usage() -> Optional[dict]:
    return _last_usage.get()


# Provider clients are created lazily and cached, so a provider's SDK is only
# imported when that provider is actually used.
_clients: dict = {}


def _anthropic_complete(system: str, user: str, model: Optional[str], max_tokens: int) -> str:
    settings = get_settings()
    if "anthropic" not in _clients:
        import anthropic

        _clients["anthropic"] = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    used_model = model or settings.anthropic_model
    resp = _clients["anthropic"].messages.create(
        model=used_model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    usage = getattr(resp, "usage", None)
    if usage is not None:
        set_last_usage(getattr(usage, "input_tokens", 0) or 0, getattr(usage, "output_tokens", 0) or 0, used_model)
    return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")


def _openai_complete(system: str, user: str, model: Optional[str], max_tokens: int) -> str:
    settings = get_settings()
    if "openai" not in _clients:
        import openai

        _clients["openai"] = openai.OpenAI(api_key=settings.openai_api_key)
    used_model = model or settings.openai_model
    resp = _clients["openai"].chat.completions.create(
        model=used_model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    usage = getattr(resp, "usage", None)
    if usage is not None:
        set_last_usage(getattr(usage, "prompt_tokens", 0) or 0, getattr(usage, "completion_tokens", 0) or 0, used_model)
    return resp.choices[0].message.content or ""


def _gemini_complete(system: str, user: str, model: Optional[str], max_tokens: int) -> str:
    settings = get_settings()
    used_model = model or settings.gemini_model
    import google.generativeai as genai

    genai.configure(api_key=settings.gemini_api_key)
    gmodel = genai.GenerativeModel(model_name=used_model, system_instruction=system)
    resp = gmodel.generate_content(
        user,
        generation_config={"max_output_tokens": max_tokens},
    )
    usage = getattr(resp, "usage_metadata", None)
    if usage is not None:
        set_last_usage(
            getattr(usage, "prompt_token_count", 0) or 0,
            getattr(usage, "candidates_token_count", 0) or 0,
            used_model,
        )
    return resp.text or ""


_PROVIDERS = {
    "anthropic": _anthropic_complete,
    "openai": _openai_complete,
    "gemini": _gemini_complete,
}


def complete_text(system: str, user: str, model: Optional[str] = None, max_tokens: int = 1024) -> str:
    """Return the assistant's text response for a single-turn prompt."""
    settings = get_settings()
    provider = settings.active_provider
    if provider is None:
        raise LLMUnavailable(
            "No LLM provider configured — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY"
        )
    return _PROVIDERS[provider](system, user, model, max_tokens)


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
