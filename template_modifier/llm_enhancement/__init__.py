"""Standalone LLM enhancement package.

This package is intentionally decoupled from workspace-specific app modules and can
be copied into another project with only the required third-party dependencies.
"""

from .observer import Observer, Subject
from .types import AgentLogEvent, DeltaEvent, LLMStreamItem, RunCompletionEvent, ToolCallEvent, ToolResultEvent
from .config import AgentConfig, LLMConfig, ProviderSettings
from .llm import BroadcastingSubject, LLM
from .agent import Agent

try:
    from .mcp_agent import MCPAgent, json_schema_to_pydantic
except ImportError:  # optional dependency
    MCPAgent = None
    json_schema_to_pydantic = None

__all__ = [
    "Observer",
    "Subject",
    "LLMStreamItem",
    "DeltaEvent",
    "ToolCallEvent",
    "ToolResultEvent",
    "RunCompletionEvent",
    "AgentLogEvent",
    "LLMConfig",
    "AgentConfig",
    "ProviderSettings",
    "BroadcastingSubject",
    "LLM",
    "Agent",
    "MCPAgent",
    "json_schema_to_pydantic",
]
