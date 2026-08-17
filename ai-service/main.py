"""FastAPI entrypoint for the AI service.

All feature endpoints require the internal shared key (X-Internal-Key) so only the
Express server can call them. LLM/embedding failures degrade to HTTP 503 so the
main app can fall back gracefully.
"""
from fastapi import FastAPI, Depends, Header, HTTPException, Response

from config import get_settings, assert_secure_config
from schemas import (
    SummarizeRequest,
    SummarizeResponse,
    ParseTaskRequest,
    ParsedTask,
    BreakdownRequest,
    BreakdownResponse,
    PlanDayRequest,
    PlanDayResponse,
    PrioritizeRequest,
    PrioritizeResponse,
    ChatRequest,
    ChatResponse,
    EmbedRequest,
    EmbedResponse,
)
from llm import LLMUnavailable
from embeddings import EmbeddingsUnavailable
import llm
import summarizer
import task_planner
import assistant
import embeddings as embeddings_mod

app = FastAPI(title="Productivity Assistant AI Service", version="0.1.0")

# Refuse to boot on Render with the public default internal key.
assert_secure_config(get_settings())


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


# Run an LLM feature and expose its token usage on response headers so the server
# can attribute cost per user (Roadmap C3). Body/schema are untouched.
def _guard_llm(response: Response, callable_, *args, **kwargs):
    llm.reset_usage()
    result = _guard(callable_, *args, **kwargs)
    usage = llm.get_last_usage()
    if usage:
        response.headers["X-AI-Input-Tokens"] = str(usage["input_tokens"])
        response.headers["X-AI-Output-Tokens"] = str(usage["output_tokens"])
        response.headers["X-AI-Model"] = usage["model"]
    return result


@app.get("/health")
def health():
    settings = get_settings()
    return {
        "status": "ok",
        "service": "ai-service",
        "llm": settings.any_llm_enabled,
        "provider": settings.active_provider,
        "embeddings": settings.embeddings_enabled,
    }


@app.post("/summarize", response_model=SummarizeResponse)
def summarize_endpoint(req: SummarizeRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, summarizer.summarize, req.text)


@app.post("/parse-task", response_model=ParsedTask)
def parse_task_endpoint(req: ParseTaskRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, task_planner.parse_task, req.text, req.now)


@app.post("/breakdown", response_model=BreakdownResponse)
def breakdown_endpoint(req: BreakdownRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, task_planner.breakdown, req.title, req.description, req.now)


@app.post("/plan-day", response_model=PlanDayResponse)
def plan_day_endpoint(req: PlanDayRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, task_planner.plan_day, req.tasks, req.schedules, req.now, req.workStart, req.workEnd)


@app.post("/prioritize", response_model=PrioritizeResponse)
def prioritize_endpoint(req: PrioritizeRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, task_planner.prioritize, req.tasks, req.now)


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest, response: Response, _=Depends(require_internal_key)):
    return _guard_llm(response, assistant.chat, req.message, req.context, req.history)


@app.post("/embed", response_model=EmbedResponse)
def embed_endpoint(req: EmbedRequest, _=Depends(require_internal_key)):
    return _guard(embeddings_mod.embed, req.input)
