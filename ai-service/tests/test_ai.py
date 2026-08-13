import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
import summarizer  # noqa: E402
import task_planner  # noqa: E402
import assistant  # noqa: E402

client = TestClient(main.app)
KEY = {"X-Internal-Key": "dev-internal-key"}


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


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


def test_chat_ok(monkeypatch):
    monkeypatch.setattr(assistant, "complete_text", lambda **kwargs: "You have 2 tasks today.")
    res = client.post(
        "/chat",
        json={"message": "What do I need to finish today?", "context": {"tasks": []}},
        headers=KEY,
    )
    assert res.status_code == 200
    assert "2 tasks" in res.json()["reply"]
