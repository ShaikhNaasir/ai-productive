"""Pydantic request/response models for the AI service."""
from typing import Optional, Literal, Any
from pydantic import BaseModel, Field

Priority = Literal["LOW", "MEDIUM", "HIGH"]


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1)


class SummarizeResponse(BaseModel):
    key_points: list[str]
    summary: str


class ParseTaskRequest(BaseModel):
    text: str = Field(min_length=1)
    now: Optional[str] = None  # ISO timestamp for resolving relative dates


class ParsedTask(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Priority = "MEDIUM"
    dueDate: Optional[str] = None  # ISO 8601 or null
    tags: list[str] = []


class TaskForPrioritization(BaseModel):
    id: Optional[str] = None
    title: str
    dueDate: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None


class PrioritizeRequest(BaseModel):
    tasks: list[TaskForPrioritization]
    now: Optional[str] = None


class PriorityRecommendation(BaseModel):
    id: Optional[str] = None
    title: str
    priority: Priority
    reason: str


class PrioritizeResponse(BaseModel):
    recommendations: list[PriorityRecommendation]


class ScheduleContext(BaseModel):
    title: str
    startTime: str
    endTime: Optional[str] = None


class PlanDayRequest(BaseModel):
    tasks: list[TaskForPrioritization] = []
    schedules: list[ScheduleContext] = []
    now: Optional[str] = None
    workStart: int = 9
    workEnd: int = 17


class PlanBlock(BaseModel):
    title: str
    startTime: str
    endTime: str
    taskId: Optional[str] = None
    reason: Optional[str] = None


class PlanDayResponse(BaseModel):
    blocks: list[PlanBlock]


class BreakdownRequest(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    now: Optional[str] = None


class BreakdownResponse(BaseModel):
    subtasks: list[str]


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    context: dict[str, Any] = {}
    history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    reply: str


class EmbedRequest(BaseModel):
    input: list[str] = Field(min_length=1)
    # Voyage ranks a query against documents better when told which it is embedding.
    input_type: Literal["query", "document"] = "document"


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int
