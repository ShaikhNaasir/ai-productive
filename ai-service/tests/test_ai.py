import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
import llm  # noqa: E402
import summarizer  # noqa: E402
import task_planner  # noqa: E402
import assistant  # noqa: E402
from config import Settings  # noqa: E402

client = TestClient(main.app)
KEY = {"X-Internal-Key": "dev-internal-key"}


def _settings(**kwargs):
    # Ignore any .env / OS keys so provider-selection is deterministic.
    base = {"anthropic_api_key": "", "openai_api_key": "", "gemini_api_key": ""}
    base.update(kwargs)
    return Settings(_env_file=None, **base)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "provider" in body


def test_active_provider_auto_priority():
    assert _settings(anthropic_api_key="a", openai_api_key="o").active_provider == "anthropic"
    assert _settings(openai_api_key="o", gemini_api_key="g").active_provider == "openai"
    assert _settings(gemini_api_key="g").active_provider == "gemini"


def test_active_provider_none():
    s = _settings()
    assert s.active_provider is None
    assert s.any_llm_enabled is False


def test_active_provider_forced_falls_back_when_key_missing():
    # Forced provider with a key wins.
    assert _settings(anthropic_api_key="a", openai_api_key="o", llm_provider="openai").active_provider == "openai"
    # Forced provider without a key falls back to the first configured one.
    assert _settings(anthropic_api_key="a", llm_provider="gemini").active_provider == "anthropic"


def test_requires_internal_key():
    res = client.post("/summarize", json={"text": "hello"})
    assert res.status_code == 401


def test_summarize_unavailable_without_llm():
    # No ANTHROPIC_API_KEY configured -> graceful 503
    res = client.post("/summarize", json={"text": "hello"}, headers=KEY)
    assert res.status_code == 503


def test_summarize_ok(monkeypatch):
    monkeypatch.setattr(
        summarizer,
        "complete_json",
        lambda **kwargs: {"key_points": ["a", "b"], "summary": "short"},
    )
    res = client.post("/summarize", json={"text": "long note text"}, headers=KEY)
    assert res.status_code == 200
    body = res.json()
    assert body["key_points"] == ["a", "b"]
    assert body["summary"] == "short"


def test_parse_task_ok(monkeypatch):
    monkeypatch.setattr(
        task_planner,
        "complete_json",
        lambda **kwargs: {
            "title": "Prepare for interview",
            "priority": "high",
            "dueDate": "2026-08-14T09:00:00Z",
            "tags": ["career"],
        },
    )
    res = client.post(
        "/parse-task",
        json={"text": "Remind me to prepare for my interview next Friday", "now": "2026-08-10T00:00:00Z"},
        headers=KEY,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Prepare for interview"
    assert body["priority"] == "HIGH"  # normalized to upper
    assert body["tags"] == ["career"]


def test_parse_task_invalid_json(monkeypatch):
    def boom(**kwargs):
        raise ValueError("Model did not return valid JSON")

    monkeypatch.setattr(task_planner, "complete_json", boom)
    res = client.post("/parse-task", json={"text": "do something"}, headers=KEY)
    assert res.status_code == 502


def test_breakdown_ok(monkeypatch):
    monkeypatch.setattr(
        task_planner,
        "complete_json",
        lambda **kwargs: {"subtasks": ["Outline", "Draft", "  ", "Publish"]},
    )
    res = client.post(
        "/breakdown",
        json={"title": "Write a blog post", "description": "on productivity"},
        headers=KEY,
    )
    assert res.status_code == 200
    # Blank entries are dropped; order preserved.
    assert res.json()["subtasks"] == ["Outline", "Draft", "Publish"]


def test_breakdown_invalid_json(monkeypatch):
    def boom(**kwargs):
        raise ValueError("Model did not return valid JSON")

    monkeypatch.setattr(task_planner, "complete_json", boom)
    res = client.post("/breakdown", json={"title": "do a thing"}, headers=KEY)
    assert res.status_code == 502


def test_plan_day_ok(monkeypatch):
    monkeypatch.setattr(
        task_planner,
        "complete_json",
        lambda **kwargs: {
            "blocks": [
                {
                    "title": "Interview prep",
                    "startTime": "2026-08-13T09:00:00Z",
                    "endTime": "2026-08-13T10:00:00Z",
                    "taskId": "1",
                    "reason": "due soon",
                },
                # Dropped: missing/invalid endTime.
                {"title": "bad block", "startTime": "2026-08-13T10:00:00Z", "endTime": "not-a-date"},
            ]
        },
    )
    res = client.post(
        "/plan-day",
        json={
            "tasks": [{"id": "1", "title": "Interview prep", "dueDate": "2026-08-14"}],
            "schedules": [{"title": "Standup", "startTime": "2026-08-13T11:00:00Z"}],
            "now": "2026-08-13T08:00:00Z",
        },
        headers=KEY,
    )
    assert res.status_code == 200
    blocks = res.json()["blocks"]
    assert len(blocks) == 1  # invalid block filtered out
    assert blocks[0]["title"] == "Interview prep"


def test_plan_day_invalid_json(monkeypatch):
    def boom(**kwargs):
        raise ValueError("Model did not return valid JSON")

    monkeypatch.setattr(task_planner, "complete_json", boom)
    res = client.post("/plan-day", json={"tasks": [], "schedules": []}, headers=KEY)
    assert res.status_code == 502


def test_prioritize_ok(monkeypatch):
    monkeypatch.setattr(
        task_planner,
        "complete_json",
        lambda **kwargs: {
            "recommendations": [
                {"id": "1", "title": "Interview prep", "priority": "high", "reason": "due soon"},
            ]
        },
    )
    res = client.post(
        "/prioritize",
        json={"tasks": [{"id": "1", "title": "Interview prep", "dueDate": "2026-08-12"}]},
        headers=KEY,
    )
    assert res.status_code == 200
    assert res.json()["recommendations"][0]["priority"] == "HIGH"


def test_prioritize_empty():
    res = client.post("/prioritize", json={"tasks": []}, headers=KEY)
    assert res.status_code == 200
    assert res.json()["recommendations"] == []


def test_usage_headers_reported(monkeypatch):
    def fake(**kwargs):
        llm.set_last_usage(120, 45, "claude-opus-4-8")
        return {"key_points": ["a"], "summary": "s"}

    monkeypatch.setattr(summarizer, "complete_json", fake)
    res = client.post("/summarize", json={"text": "long note"}, headers=KEY)
    assert res.status_code == 200
    assert res.headers["X-AI-Input-Tokens"] == "120"
    assert res.headers["X-AI-Output-Tokens"] == "45"
    assert res.headers["X-AI-Model"] == "claude-opus-4-8"


def test_usage_headers_absent_when_no_usage(monkeypatch):
    # complete_json that never records usage (e.g. monkeypatched) -> no headers.
    monkeypatch.setattr(summarizer, "complete_json", lambda **kwargs: {"key_points": [], "summary": "s"})
    res = client.post("/summarize", json={"text": "x"}, headers=KEY)
    assert res.status_code == 200
    assert "X-AI-Output-Tokens" not in res.headers


def test_chat_ok(monkeypatch):
    monkeypatch.setattr(assistant, "complete_text", lambda **kwargs: "You have 2 tasks today.")
    res = client.post(
        "/chat",
        json={"message": "What do I need to finish today?", "context": {"tasks": []}},
        headers=KEY,
    )
    assert res.status_code == 200
    assert "2 tasks" in res.json()["reply"]


# --- Provider hardening (llm.py) ----------------------------------------------

def _part(text):
    return types.SimpleNamespace(text=text)


def _candidate(parts, finish_reason=None):
    return types.SimpleNamespace(content=types.SimpleNamespace(parts=parts), finish_reason=finish_reason)


def _gemini_resp(candidates, usage=None, prompt_feedback=None):
    return types.SimpleNamespace(
        candidates=candidates, usage_metadata=usage, prompt_feedback=prompt_feedback
    )


def test_gemini_text_joins_parts():
    resp = _gemini_resp([_candidate([_part("hello "), _part("world")], finish_reason="STOP")])
    assert llm._gemini_text(resp) == "hello world"


def test_gemini_text_returns_partial_on_max_tokens():
    # Truncated output still has a part -> return it instead of raising.
    resp = _gemini_resp([_candidate([_part('{"subtasks":[')], finish_reason="MAX_TOKENS")])
    assert llm._gemini_text(resp) == '{"subtasks":['


def test_gemini_text_raises_clear_error_when_empty_max_tokens():
    # This is the intermittent "invalid" bug: no parts because the budget was
    # exhausted (e.g. a thinking model). We surface finish_reason, not a crash.
    resp = _gemini_resp([_candidate([], finish_reason="MAX_TOKENS")])
    with pytest.raises(ValueError) as exc:
        llm._gemini_text(resp)
    assert "MAX_TOKENS" in str(exc.value)


def test_gemini_text_raises_on_blocked_prompt():
    resp = _gemini_resp([], prompt_feedback=types.SimpleNamespace(block_reason="SAFETY"))
    with pytest.raises(ValueError) as exc:
        llm._gemini_text(resp)
    assert "SAFETY" in str(exc.value)


# The provider SDKs aren't installed in the test venv (and tests must not need
# network), so inject fake modules that expose just the surface llm.py touches.
def _install_fake_gemini(monkeypatch, generative_model_cls):
    google_pkg = types.ModuleType("google")
    genai = types.ModuleType("google.generativeai")
    genai.configure = lambda **k: None
    genai.GenerativeModel = generative_model_cls
    api_core = types.ModuleType("google.api_core")
    exceptions = types.ModuleType("google.api_core.exceptions")

    class GoogleAPIError(Exception):
        pass

    class NotFound(GoogleAPIError):
        pass

    exceptions.GoogleAPIError = GoogleAPIError
    exceptions.NotFound = NotFound
    google_pkg.generativeai = genai
    google_pkg.api_core = api_core
    api_core.exceptions = exceptions
    for name, mod in {
        "google": google_pkg,
        "google.generativeai": genai,
        "google.api_core": api_core,
        "google.api_core.exceptions": exceptions,
    }.items():
        monkeypatch.setitem(sys.modules, name, mod)
    return exceptions


def test_gemini_complete_uses_json_mode_and_records_usage(monkeypatch):
    captured = {}

    class FakeModel:
        def __init__(self, model_name, system_instruction):
            captured["model_name"] = model_name

        def generate_content(self, user, generation_config=None):
            captured["gen_config"] = generation_config
            return _gemini_resp(
                [_candidate([_part('{"ok": true}')], finish_reason="STOP")],
                usage=types.SimpleNamespace(prompt_token_count=10, candidates_token_count=5),
            )

    _install_fake_gemini(monkeypatch, FakeModel)
    monkeypatch.setattr(llm, "get_settings", lambda: _settings(gemini_api_key="g", gemini_model="gemini-2.5-flash"))

    llm.reset_usage()
    out = llm._gemini_complete("sys", "user", None, 256, True)
    assert out == '{"ok": true}'
    assert captured["model_name"] == "gemini-2.5-flash"
    assert captured["gen_config"]["response_mime_type"] == "application/json"
    assert captured["gen_config"]["max_output_tokens"] == 256
    assert llm.get_last_usage()["input_tokens"] == 10


def test_gemini_complete_invalid_model_raises_unavailable(monkeypatch):
    # A bad GEMINI_MODEL (e.g. the non-existent "gemini-3.6-flash") -> graceful 503,
    # not an opaque 500.
    holder = {}

    class BoomModel:
        def __init__(self, **kwargs):
            pass

        def generate_content(self, *a, **k):
            raise holder["NotFound"]("models/gemini-3.6-flash is not found")

    exceptions = _install_fake_gemini(monkeypatch, BoomModel)
    holder["NotFound"] = exceptions.NotFound
    monkeypatch.setattr(llm, "get_settings", lambda: _settings(gemini_api_key="g", gemini_model="gemini-3.6-flash"))

    with pytest.raises(llm.LLMUnavailable):
        llm._gemini_complete("sys", "user", None, 256, True)


def _fake_openai_client(create_fn):
    completions = types.SimpleNamespace(create=create_fn)
    return types.SimpleNamespace(chat=types.SimpleNamespace(completions=completions))


def _install_fake_openai(monkeypatch):
    openai_mod = types.ModuleType("openai")

    class OpenAIError(Exception):
        pass

    openai_mod.OpenAIError = OpenAIError
    monkeypatch.setitem(sys.modules, "openai", openai_mod)
    return openai_mod


def test_openai_complete_uses_json_mode(monkeypatch):
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        return types.SimpleNamespace(
            usage=types.SimpleNamespace(prompt_tokens=3, completion_tokens=2),
            choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"ok":1}'))],
        )

    _install_fake_openai(monkeypatch)
    monkeypatch.setattr(llm, "get_settings", lambda: _settings(openai_api_key="o"))
    monkeypatch.setitem(llm._clients, "openai", _fake_openai_client(create))
    out = llm._openai_complete("sys", "user", None, 128, True)
    assert out == '{"ok":1}'
    assert captured["response_format"] == {"type": "json_object"}


def test_openai_error_raises_unavailable(monkeypatch):
    openai_mod = _install_fake_openai(monkeypatch)

    def create(**kwargs):
        raise openai_mod.OpenAIError("invalid api key")

    monkeypatch.setattr(llm, "get_settings", lambda: _settings(openai_api_key="o"))
    monkeypatch.setitem(llm._clients, "openai", _fake_openai_client(create))
    with pytest.raises(llm.LLMUnavailable):
        llm._openai_complete("sys", "user", None, 128, False)


def test_anthropic_error_raises_unavailable(monkeypatch):
    anthropic_mod = types.ModuleType("anthropic")

    class APIError(Exception):
        pass

    anthropic_mod.APIError = APIError
    monkeypatch.setitem(sys.modules, "anthropic", anthropic_mod)

    def create(**kwargs):
        raise APIError("overloaded")

    client_obj = types.SimpleNamespace(messages=types.SimpleNamespace(create=create))
    monkeypatch.setattr(llm, "get_settings", lambda: _settings(anthropic_api_key="a"))
    monkeypatch.setitem(llm._clients, "anthropic", client_obj)
    with pytest.raises(llm.LLMUnavailable):
        llm._anthropic_complete("sys", "user", None, 128, False)


def test_provider_unavailable_surfaces_503(monkeypatch):
    # End-to-end: a provider failure mapped to LLMUnavailable degrades to 503.
    def boom(**kwargs):
        raise llm.LLMUnavailable("Gemini request failed for model 'gemini-3.6-flash'")

    monkeypatch.setattr(task_planner, "complete_json", boom)
    res = client.post("/breakdown", json={"title": "do a thing"}, headers=KEY)
    assert res.status_code == 503
