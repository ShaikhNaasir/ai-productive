"""Chat assistant. The server gathers relevant user data and passes it as context;
the assistant answers grounded in that context only."""
import json

from llm import complete_text
from schemas import ChatResponse

SYSTEM = (
    "You are a helpful personal productivity assistant. Answer the user's question "
    "using ONLY the context provided (their tasks, notes, schedules, reminders). "
    "If the context does not contain the answer, say you don't have that information. "
    "Be concise and actionable. When listing tasks, prefer the most urgent first."
)


def chat(message: str, context: dict, history: list[dict] | None = None) -> ChatResponse:
    context_json = json.dumps(context, default=str)[:12000]
    convo = ""
    for turn in (history or [])[-6:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        convo += f"\n{role.upper()}: {content}"

    user = (
        f"User context (JSON):\n{context_json}\n"
        f"{convo}\n\nUSER QUESTION: {message}"
    )
    reply = complete_text(system=SYSTEM, user=user, max_tokens=1024)
    return ChatResponse(reply=reply.strip())
