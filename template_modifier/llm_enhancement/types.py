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
    tokens_elapsed: Optional[int] = 0
    time_elapsed: Optional[float] = 0.0


class ToolCallEvent(BaseModel):
    session_id: Optional[str] = None
    type: str = "tool_call"
    tool_name: str = "unknown"
    tool_kwargs: Dict[str, Any] = Field(default_factory=dict)
    content: Dict[str, Any] = Field(default_factory=dict)
    tokens_elapsed: Optional[int] = 0
    time_elapsed: Optional[float] = 0.0


class ToolResultEvent(BaseModel):
    session_id: Optional[str] = None
    type: str = "tool_result"
    tool_name: str = "unknown"
    tool_result: Dict[str, Any] = Field(default_factory=dict)
    content: Dict[str, Any] = Field(default_factory=dict)
    tokens_elapsed: Optional[int] = 0
    time_elapsed: Optional[float] = 0.0


class RunCompletionEvent(BaseModel):
    session_id: Optional[str] = None
    content: Any = None
    type: str = "run_completion"
    tokens_elapsed: Optional[int] = 0
    time_elapsed: Optional[float] = 0.0



class AgentLogEvent(BaseModel):
    session_id: str
    type: str = "log"
    message: str
    level: str = "INFO"
