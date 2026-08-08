from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class LLMStreamItem(BaseModel):
    run_id: str
    delta: str
    text: str
    tokens_utilized: int
    time_taken: float


class DeltaEvent(BaseModel):
    delta: str = ""
    session_id: Optional[str] = None
    type: str = "text"
    messageType: str = "Answering"
    usage_metadata: Dict[str, Any] = Field(default_factory=dict)


class ToolCallEvent(BaseModel):
    session_id: Optional[str] = None
    tool_name: str = "unknown"
    tool_kwargs: Dict[str, Any] = Field(default_factory=dict)
    content: Dict[str, Any] = Field(default_factory=dict)


class ToolResultEvent(BaseModel):
    session_id: Optional[str] = None
    tool_name: str = "unknown"
    tool_result: Dict[str, Any] = Field(default_factory=dict)
    content: Dict[str, Any] = Field(default_factory=dict)


class RunCompletionEvent(BaseModel):
    session_id: Optional[str] = None
    content: Any = None
    type: str = "run_completion"


class AgentLogEvent(BaseModel):
    session_id: str
    type: str = "log"
    message: str
    level: str = "INFO"
