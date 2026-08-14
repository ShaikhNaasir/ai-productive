"""Provider-agnostic LLM wrapper.

Supports Anthropic, OpenAI, and Google Gemini — whichever key is configured
(see `config.active_provider`). Kept small and side-effect free so tests can
monkeypatch `complete_text` without any network access. Raises `LLMUnavailable`
when no provider is configured, which callers translate into a graceful 503.
"""
import json
import logging
import re
from contextvars import ContextVar
from typing import Any, Optional

from config import get_settings

logger = logging.getLogger(__name__)


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


def _anthropic_complete(
    system: str, user: str, model: Optional[str], max_tokens: int, json_mode: bool, response_schema: Any = None
) -> str:
    settings = get_settings()
    import anthropic

    if "anthropic" not in _clients:
        _clients["anthropic"] = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    used_model = model or settings.anthropic_model
    # Anthropic has no JSON-mode flag; the system prompt already constrains the shape.
    try:
        resp = _clients["anthropic"].messages.create(
            model=used_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as exc:
        raise LLMUnavailable(f"Anthropic request failed for model '{used_model}': {exc}") from exc
    usage = getattr(resp, "usage", None)
    if usage is not None:
        set_last_usage(getattr(usage, "input_tokens", 0) or 0, getattr(usage, "output_tokens", 0) or 0, used_model)
    return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")


def _openai_complete(
    system: str, user: str, model: Optional[str], max_tokens: int, json_mode: bool, response_schema: Any = None
) -> str:
    settings = get_settings()
    import openai

    if "openai" not in _clients:
        _clients["openai"] = openai.OpenAI(api_key=settings.openai_api_key)
    used_model = model or settings.openai_model
    kwargs = dict(
        model=used_model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    try:
        resp = _clients["openai"].chat.completions.create(**kwargs)
    except openai.OpenAIError as exc:
        raise LLMUnavailable(f"OpenAI request failed for model '{used_model}': {exc}") from exc
    usage = getattr(resp, "usage", None)
    if usage is not None:
        set_last_usage(getattr(usage, "prompt_tokens", 0) or 0, getattr(usage, "completion_tokens", 0) or 0, used_model)
    return resp.choices[0].message.content or ""


def _gemini_text(resp) -> str:
    """Extract the answer text from a Gemini response without ``.text``.

    Gemini's ``response.text`` quick-accessor raises whenever the candidate's
    ``finish_reason`` isn't ``STOP`` (e.g. ``MAX_TOKENS`` or ``SAFETY``), which
    made long/edge generations surface as opaque failures. Join the answer parts
    ourselves (skipping thinking-summary parts, which carry ``thought=True``) and,
    when there are none, raise a message that names the reason.
    """
    for cand in getattr(resp, "candidates", None) or []:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or [] if content is not None else []
        text = "".join(
            getattr(p, "text", "") or "" for p in parts if not getattr(p, "thought", False)
        )
        if text:
            return text
    feedback = getattr(resp, "prompt_feedback", None)
    block = getattr(feedback, "block_reason", None) if feedback is not None else None
    if block:
        raise ValueError(f"Gemini blocked the prompt (block_reason={block})")
    candidates = getattr(resp, "candidates", None) or []
    finish = getattr(candidates[0], "finish_reason", None) if candidates else None
    raise ValueError(f"Gemini returned no text (finish_reason={finish})")


def _gemini_complete(
    system: str, user: str, model: Optional[str], max_tokens: int, json_mode: bool, response_schema: Any = None
) -> str:
    settings = get_settings()
    used_model = model or settings.gemini_model
    from google import genai
    from google.genai import errors as genai_errors

    if "gemini" not in _clients:
        _clients["gemini"] = genai.Client(api_key=settings.gemini_api_key)

    config: dict = {"system_instruction": system, "max_output_tokens": max_tokens}
    level = (settings.gemini_thinking_level or "").strip()
    if level:
        # Keep reasoning (and its token cost) low on Gemini 3.x thinking models.
        config["thinking_config"] = {"thinking_level": level}
    if json_mode:
        # Native JSON mode: no code fences or prose, so fewer wasted output tokens.
        config["response_mime_type"] = "application/json"
        if response_schema is not None:
            # Structured output: constrain generation to the exact response shape.
            config["response_schema"] = response_schema

    try:
        resp = _clients["gemini"].models.generate_content(
            model=used_model, contents=user, config=config
        )
    except genai_errors.APIError as exc:
        raise LLMUnavailable(f"Gemini request failed for model '{used_model}': {exc}") from exc

    usage = getattr(resp, "usage_metadata", None)
    thoughts = 0
    if usage is not None:
        thoughts = getattr(usage, "thoughts_token_count", 0) or 0
        # Thinking tokens are billed as output, so fold them in for accurate cost.
        set_last_usage(
            getattr(usage, "prompt_token_count", 0) or 0,
            (getattr(usage, "candidates_token_count", 0) or 0) + thoughts,
            used_model,
        )
    candidates = getattr(resp, "candidates", None) or []
    finish = getattr(candidates[0], "finish_reason", None) if candidates else None
    logger.info(
        "gemini call model=%s finish_reason=%s thoughts_tokens=%s", used_model, finish, thoughts
    )
    return _gemini_text(resp)


_PROVIDERS = {
    "anthropic": _anthropic_complete,
    "openai": _openai_complete,
    "gemini": _gemini_complete,
}


def complete_text(
    system: str,
    user: str,
    model: Optional[str] = None,
    max_tokens: int = 1024,
    json_mode: bool = False,
    response_schema: Any = None,
) -> str:
    """Return the assistant's text response for a single-turn prompt.

    Set ``json_mode`` to have providers that support it emit raw JSON (no code
    fences / prose), which cuts wasted output tokens and makes parsing reliable.
    Pass ``response_schema`` (a Pydantic model / JSON schema) to additionally
    constrain the output shape on providers that support structured output
    (Gemini); it is ignored where unsupported.
    """
    settings = get_settings()
    provider = settings.active_provider
    if provider is None:
        raise LLMUnavailable(
            "No LLM provider configured — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY"
        )
    return _PROVIDERS[provider](system, user, model, max_tokens, json_mode, response_schema)


def _extract_json(text: str) -> str:
    """Pull a JSON object out of a model response that may include code fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, re.DOTALL)
    if fenced:
        return fenced.group(1)
    braces = re.search(r"(\{.*\}|\[.*\])", text, re.DOTALL)
    if braces:
        return braces.group(1)
    return text


def complete_json(
    system: str, user: str, model: Optional[str] = None, max_tokens: int = 1024, response_schema: Any = None
) -> dict:
    """Ask the model for JSON and parse it. Raises ValueError on unparseable output."""
    raw = complete_text(
        system=system, user=user, model=model, max_tokens=max_tokens, json_mode=True, response_schema=response_schema
    )
    try:
        return json.loads(_extract_json(raw))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {raw[:200]}") from exc
