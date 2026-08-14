"""Note summarization: long text -> key points + short summary."""
from llm import complete_json
from schemas import SummarizeResponse

SYSTEM = (
    "You are a concise summarization assistant. Given a note, extract the most "
    "important points and a one-paragraph summary. Respond ONLY with JSON of the form: "
    '{"key_points": ["...", "..."], "summary": "..."}. '
    "Use 3-6 key points. Do not add commentary outside the JSON."
)


def summarize(text: str) -> SummarizeResponse:
    data = complete_json(system=SYSTEM, user=text, max_tokens=768, response_schema=SummarizeResponse)
    key_points = [str(p) for p in data.get("key_points", []) if str(p).strip()]
    summary = str(data.get("summary", "")).strip()
    return SummarizeResponse(key_points=key_points, summary=summary)
