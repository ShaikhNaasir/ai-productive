"""Natural-language task creation and AI prioritization."""
from datetime import datetime, timezone

from llm import complete_json
from schemas import (
    BreakdownResponse,
    ParsedTask,
    PrioritizeResponse,
    PriorityRecommendation,
    TaskForPrioritization,
)

PARSE_SYSTEM = (
    "You convert a natural-language instruction into a single structured task. "
    'Resolve relative dates like "next Friday" or "tomorrow at 10am" against the '
    "current date-time given below. "
    "Respond ONLY with JSON of this shape: "
    '{"title": string, "description": string|null, "priority": "LOW"|"MEDIUM"|"HIGH", '
    '"dueDate": ISO-8601 string|null, "tags": string[]}. '
    "Infer a sensible priority. Keep the title short and imperative."
)

BREAKDOWN_SYSTEM = (
    "You break a single task into an ordered list of concrete, actionable subtasks. "
    "Produce between 3 and 7 subtasks, ordered by the sequence they should be done in. "
    "Each subtask is a short imperative phrase; do not restate the parent task. "
    "Respond ONLY with JSON of this shape: "
    '{"subtasks": string[]}.'
)

PRIORITIZE_SYSTEM = (
    "You are a productivity assistant. Given the user's tasks, rank them by what "
    "they should focus on, considering deadline, importance, effort, dependencies, "
    "and current workload. "
    "Respond ONLY with JSON of this shape: "
    '{"recommendations": [{"id": string, "title": string, '
    '"priority": "LOW"|"MEDIUM"|"HIGH", "reason": string}]}. '
    "Order from highest to lowest priority."
)


def _now_iso(now: str | None) -> str:
    return now or datetime.now(timezone.utc).isoformat()


def parse_task(text: str, now: str | None = None) -> ParsedTask:
    system = f"{PARSE_SYSTEM}\nCurrent date-time (ISO 8601): {_now_iso(now)}"
    data = complete_json(system=system, user=text, max_tokens=500)
    priority = str(data.get("priority", "MEDIUM")).upper()
    if priority not in ("LOW", "MEDIUM", "HIGH"):
        priority = "MEDIUM"
    return ParsedTask(
        title=str(data.get("title") or text).strip()[:300],
        description=(data.get("description") or None),
        priority=priority,
        dueDate=(data.get("dueDate") or None),
        tags=[str(t) for t in data.get("tags", []) if str(t).strip()],
    )


def breakdown(title: str, description: str | None = None, now: str | None = None) -> BreakdownResponse:
    system = f"{BREAKDOWN_SYSTEM}\nCurrent date-time (ISO 8601): {_now_iso(now)}"
    user = title if not description else f"{title}\n\n{description}"
    data = complete_json(system=system, user=user, max_tokens=600)
    subtasks = []
    for s in data.get("subtasks", []):
        text = str(s).strip()[:300]
        if text:
            subtasks.append(text)
    return BreakdownResponse(subtasks=subtasks[:7])


def prioritize(tasks: list[TaskForPrioritization], now: str | None = None) -> PrioritizeResponse:
    if not tasks:
        return PrioritizeResponse(recommendations=[])
    system = f"{PRIORITIZE_SYSTEM}\nCurrent date-time (ISO 8601): {_now_iso(now)}"
    user = "\n".join(
        f"- id={t.id or ''} | {t.title} | priority={t.priority or 'NONE'} | "
        f"due={t.dueDate or 'none'} | status={t.status or 'none'}"
        for t in tasks
    )
    data = complete_json(system=system, user=user, max_tokens=1200)
    recs = []
    for r in data.get("recommendations", []):
        pr = str(r.get("priority", "MEDIUM")).upper()
        if pr not in ("LOW", "MEDIUM", "HIGH"):
            pr = "MEDIUM"
        recs.append(
            PriorityRecommendation(
                id=r.get("id") or None,
                title=str(r.get("title", "")).strip(),
                priority=pr,
                reason=str(r.get("reason", "")).strip(),
            )
        )
    return PrioritizeResponse(recommendations=recs)
