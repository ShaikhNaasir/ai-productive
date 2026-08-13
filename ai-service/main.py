"""FastAPI entrypoint for the AI service.

All feature endpoints require the internal shared key (X-Internal-Key) so only the
Express server can call them. LLM/embedding failures degrade to HTTP 503 so the
main app can fall back gracefully.
"""
from fastapi import FastAPI, Depends, Header, HTTPException

from config import get_settings
from schemas import (
    SummarizeRequest,
    SummarizeResponse,
    ParseTaskRequest,
    ParsedTask,
    BreakdownRequest,
    BreakdownResponse,
    PrioritizeRequest,
    PrioritizeResponse,
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
)
from llm import LLMUnavailable
from embeddings import EmbeddingsUnavailable
import summarizer
import task_planner
import assistant
import embeddings as embeddings_mod

app = FastAPI(title="Productivity Assistant AI Service", version="0.1.0")


def require_internal_key(x_internal_key: str = Header(default="")):
    settings = get_settings()
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid internal key")


def _guard(callable_, *args, **kwargs):
    """Run an LLM/embedding call, translating unavailability into 503."""
    try:
        return callable_(*args, **kwargs)
    except (LLMUnavailable, EmbeddingsUnavailable) as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "service": "ai-service",
        "llm": settings.anthropic_enabled,
        "embeddings": settings.embeddings_enabled,
    }


@app.post("/summarize", response_model=SummarizeResponse)
def summarize_endpoint(req: SummarizeRequest, _=Depends(require_internal_key)):
    return _guard(summarizer.summarize, req.text)


@app.post("/parse-task", response_model=ParsedTask)
def parse_task_endpoint(req: ParseTaskRequest, _=Depends(require_internal_key)):
    return _guard(task_planner.parse_task, req.text, req.now)


@app.post("/breakdown", response_model=BreakdownResponse)
def breakdown_endpoint(req: BreakdownRequest, _=Depends(require_internal_key)):
    return _guard(task_planner.breakdown, req.title, req.description, req.now)


@app.post("/prioritize", response_model=PrioritizeResponse)
def prioritize_endpoint(req: PrioritizeRequest, _=Depends(require_internal_key)):
    return _guard(task_planner.prioritize, req.tasks, req.now)


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, _=Depends(require_internal_key)):
    return _guard(assistant.chat, req.message, req.context, req.history)


@app.post("/embed", response_model=EmbedResponse)
def embed_endpoint(req: EmbedRequest, _=Depends(require_internal_key)):
    return _guard(embeddings_mod.embed, req.input)
