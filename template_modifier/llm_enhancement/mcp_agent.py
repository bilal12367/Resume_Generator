from __future__ import annotations

import json
import os
import sqlite3
import time
from typing import Any, Callable, List, Optional, Union, Literal

from llama_index.core.tools import FunctionTool
from pydantic import Field, create_model, BaseModel

from .agent import Agent
from .config import AgentConfig
from .observer import Subject, Observer
from .types import DeltaEvent, ToolCallEvent, ToolResultEvent, RunCompletionEvent

try:
    from dev_containers.connect import CentrifugoClient
except ImportError:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from dev_containers.connect import CentrifugoClient


class CentrifugoObserver(Observer):
    """Observer that takes agent events and publishes them to Centrifugo on a specified channel."""

    def __init__(self, channel: str = "workflow", client: Optional[CentrifugoClient] = None):
        self.channel = channel
        self.client = client or CentrifugoClient()
        super().__init__(self.handle_event)

    def handle_event(self, event_data: Any) -> None:
        try:
            if isinstance(event_data, str):
                try:
                    payload = json.loads(event_data)
                except Exception:
                    payload = {"message": event_data}
            elif isinstance(event_data, dict):
                payload = event_data
            elif hasattr(event_data, "model_dump"):
                payload = event_data.model_dump()
            else:
                payload = {"data": str(event_data)}

            self.client.publish(self.channel, payload)
        except Exception as e:
            print(f"[CentrifugoObserver Error] Failed to publish to channel '{self.channel}': {e}")


def create_centrifugo_observer(channel: str = "workflow", client: Optional[CentrifugoClient] = None) -> CentrifugoObserver:
    """Factory function to create a Centrifugo observer for publishing agent events."""
    return CentrifugoObserver(channel=channel, client=client)


def _create_mcp_tool_fn(agent: Any, session: Any, tool_name: str) -> Callable:
    """Helper factory to create a clean async callable for an MCP tool with metrics tracking and notification."""
    async def mcp_tool_fn(**kwargs):
        session_id = getattr(agent, "run_id", "unknown") or "unknown"
        kwargs_str = json.dumps(kwargs)

        # Calculate token usage: len(text) // 3
        arg_tokens = len(kwargs_str) // 3
        if hasattr(agent, "total_tokens"):
            agent.total_tokens += arg_tokens
        else:
            agent.total_tokens = arg_tokens

        current_tokens = getattr(agent, "total_tokens", 0)
        current_time = agent.get_time_elapsed() if hasattr(agent, "get_time_elapsed") else 0.0

        tool_call_evt = ToolCallEvent(
            session_id=session_id,
            tool_name=tool_name,
            tool_kwargs=kwargs,
            type="tool_call",
            content={
                "tool_name": tool_name,
                "tool_kwargs": kwargs,
                "tokens_elapsed": current_tokens,
                "time_elapsed": current_time,
            },
            tokens_elapsed=current_tokens,
            time_elapsed=current_time,
        )
        if hasattr(agent, "notify_all"):
            agent.notify_all(tool_call_evt.model_dump_json())

        if hasattr(agent, "_save_tool_event"):
            agent._save_tool_event(
                session_id=session_id,
                event_type="tool_call",
                tool_name=tool_name,
                content=kwargs_str
            )

        res = await session.call_tool(tool_name, arguments=kwargs)
        res_text = ""
        if res.content and len(res.content) > 0:
            res_text = res.content[0].text

        res_tokens = len(res_text) // 3
        agent.total_tokens += res_tokens

        current_tokens = getattr(agent, "total_tokens", 0)
        current_time = agent.get_time_elapsed() if hasattr(agent, "get_time_elapsed") else 0.0

        preview_res_text = res_text if len(res_text) <= 15000 else res_text[:15000] + "\n\n[... Truncated live event payload to prevent WebSocket overflow ...]"

        try:
            parsed_result = json.loads(preview_res_text)
            tool_result_payload = {"result": parsed_result}
        except Exception:
            tool_result_payload = {"result": preview_res_text}

        tool_result_evt = ToolResultEvent(
            session_id=session_id,
            tool_name=tool_name,
            tool_result=tool_result_payload,
            type="tool_result",
            content={
                "tool_name": tool_name,
                "tool_result": tool_result_payload,
                "tokens_elapsed": current_tokens,
                "time_elapsed": current_time,
            },
            tokens_elapsed=current_tokens,
            time_elapsed=current_time,
        )
        if hasattr(agent, "notify_all"):
            agent.notify_all(tool_result_evt.model_dump_json())

        if hasattr(agent, "_save_tool_event"):
            agent._save_tool_event(
                session_id=session_id,
                event_type="tool_result",
                tool_name=tool_name,
                content=res_text
            )

        return res_text
    return mcp_tool_fn


class MCPAgent(Agent):
    """Agent subclass that dynamically fetches tools from external MCP server URLs,
    binds them to LlamaIndex, tracks metrics (tokens, time), notifies tool events,
    and supports Centrifugo observer streaming.
    """

    def __init__(
        self,
        agent_config: AgentConfig,
        mcp_urls: List[str] = [],
        tools: List[Callable] = [],
        run_id: Optional[str] = None,
        attach_centrifugo: bool = True,
        centrifugo_channel: str = "workflow",
    ):
        self.mcp_urls = mcp_urls
        self.mcp_sessions = []
        self._exit_stack = None
        self.total_tokens = 0
        super().__init__(agent_config=agent_config, tools=tools, run_id=run_id)

        db_uri = os.getenv("DATABASE_URL")
        if not db_uri:
            db_uri = getattr(agent_config, "db_uri", "sqlite:///test.db")
        if db_uri.startswith("sqlite:///"):
            self.db_path = db_uri[len("sqlite:///"):]
        else:
            self.db_path = db_uri

        # Route relative DB paths into a hidden .db_data folder to prevent Live Server/file watchers from reloading tab on DB writes
        if self.db_path and not os.path.isabs(self.db_path) and not self.db_path.startswith("."):
            db_dir = ".db_data"
            os.makedirs(db_dir, exist_ok=True)
            self.db_path = os.path.join(db_dir, os.path.basename(self.db_path))

        self._db_conn = None

        if attach_centrifugo:
            self.attach_centrifugo_observer(channel=centrifugo_channel)

    def attach_centrifugo_observer(self, channel: str = "workflow", client: Optional[CentrifugoClient] = None) -> CentrifugoObserver:
        """Attach an observer that publishes agent events to a Centrifugo channel."""
        observer = create_centrifugo_observer(channel=channel, client=client)
        self.add_observer(observer)
        return observer

    async def __aenter__(self):
        await self.connect_mcp()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.disconnect_mcp()

    async def connect_mcp(self):
        from contextlib import AsyncExitStack
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        self._exit_stack = AsyncExitStack()
        self.mcp_sessions = []
        
        # Deduplicate and preserve initial local tools passed during initialization
        existing_local_tools = [t for t in self.tools if getattr(t, "name", None) not in ["search_jobs", "get_job_details", "process_jobs"]] if hasattr(self, "tools") else []
        all_tools = list(existing_local_tools)

        try:
            for url in self.mcp_urls:
                read, write = await self._exit_stack.enter_async_context(sse_client(url))
                session = await self._exit_stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                self.mcp_sessions.append(session)

                mcp_tools_res = await session.list_tools()
                for mcp_tool in mcp_tools_res.tools:
                    tool_name = mcp_tool.name
                    tool_description = mcp_tool.description

                    # Create a clean tool callable using the helper factory
                    tool_fn = _create_mcp_tool_fn(self, session, tool_name)
                    tool_fn.__name__ = tool_name
                    tool_fn.__doc__ = tool_description

                    pydantic_model = json_schema_to_pydantic(f"{tool_name}_schema", mcp_tool.inputSchema)
                    tool = FunctionTool.from_defaults(
                        fn=tool_fn,
                        name=tool_name,
                        description=tool_description,
                        fn_schema=pydantic_model,
                    )
                    all_tools.append(tool)

            self.tools = all_tools
            self._log(f"MCPAgent connected to {len(self.mcp_urls)} server(s). Dynamic tool binding completed.")
        except Exception as e:
            await self.disconnect_mcp()
            raise e

    async def disconnect_mcp(self):
        if self._exit_stack:
            await self._exit_stack.aclose()
            self._exit_stack = None
        self.mcp_sessions = []
        if self._db_conn:
            try:
                self._db_conn.close()
            except Exception:
                pass
            self._db_conn = None

    async def chat(self, new_message: str, system_prompt: Optional[str] = None):
        # Automatically connect lazily if not already connected
        if not self.mcp_sessions and self.mcp_urls:
            await self.connect_mcp()

        self.start_time = time.time()

        async for event in super().chat(new_message, system_prompt):
            if isinstance(event, DeltaEvent):
                event.tokens_elapsed = getattr(self, "total_tokens", 0)
                event.time_elapsed = self.get_time_elapsed()
                self.notify_all(event.model_dump_json())
            elif isinstance(event, RunCompletionEvent):
                event.tokens_elapsed = getattr(self, "total_tokens", 0)
                event.time_elapsed = self.get_time_elapsed()
                self.notify_all(event.model_dump_json())
            yield event

    async def call_tool_manually(self, tool_name: str, arguments: dict = None) -> Any:
        """Call a connected MCP tool by name with the given arguments manually."""
        arguments = arguments or {}
        session_id = self.run_id or "unknown"
        arg_str = json.dumps(arguments)
        self.total_tokens += len(arg_str) // 3

        for tool in self.tools:
            if tool.metadata.name == tool_name:
                self.notify_all(
                    ToolCallEvent(
                        session_id=session_id,
                        tool_name=tool_name,
                        tool_kwargs=arguments,
                        type="tool_call",
                        content={
                            "tool_name": tool_name,
                            "tool_kwargs": arguments,
                            "tokens_elapsed": getattr(self, "total_tokens", 0),
                            "time_elapsed": self.get_time_elapsed(),
                        },
                        tokens_elapsed=getattr(self, "total_tokens", 0),
                        time_elapsed=self.get_time_elapsed(),
                    ).model_dump_json()
                )

                self._save_tool_event(
                    session_id=session_id,
                    event_type="tool_call",
                    tool_name=tool_name,
                    content=arg_str
                )

                res = await tool.acall(**arguments)
                res_str = str(res.content)
                self.total_tokens += len(res_str) // 3

                self._save_tool_event(
                    session_id=session_id,
                    event_type="tool_result",
                    tool_name=tool_name,
                    content=res_str
                )

                preview_res_str = res_str if len(res_str) <= 15000 else res_str[:15000] + "\n\n[... Truncated live event payload ...]"
                try:
                    parsed_res = json.loads(preview_res_str)
                    res_payload = {"result": parsed_res}
                except Exception:
                    res_payload = {"result": preview_res_str}

                self.notify_all(
                    ToolResultEvent(
                        session_id=session_id,
                        tool_name=tool_name,
                        tool_result=res_payload,
                        type="tool_result",
                        content={
                            "tool_name": tool_name,
                            "tool_result": res_payload,
                            "tokens_elapsed": getattr(self, "total_tokens", 0),
                            "time_elapsed": self.get_time_elapsed(),
                        },
                        tokens_elapsed=getattr(self, "total_tokens", 0),
                        time_elapsed=self.get_time_elapsed(),
                    ).model_dump_json()
                )
                return res.raw_output

        for session in self.mcp_sessions:
            try:
                mcp_tools = await session.list_tools()
                for t in mcp_tools.tools:
                    if t.name == tool_name:
                        self.notify_all(
                            ToolCallEvent(
                                session_id=session_id,
                                tool_name=tool_name,
                                tool_kwargs=arguments,
                                type="tool_call",
                                content={
                                    "tool_name": tool_name,
                                    "tool_kwargs": arguments,
                                    "tokens_elapsed": getattr(self, "total_tokens", 0),
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                                tokens_elapsed=getattr(self, "total_tokens", 0),
                                time_elapsed=self.get_time_elapsed(),
                            ).model_dump_json()
                        )

                        self._save_tool_event(
                            session_id=session_id,
                            event_type="tool_call",
                            tool_name=tool_name,
                            content=arg_str
                        )

                        res = await session.call_tool(tool_name, arguments=arguments)
                        res_text = ""
                        if res.content and len(res.content) > 0:
                            res_text = res.content[0].text

                        self.total_tokens += len(res_text) // 3

                        self._save_tool_event(
                            session_id=session_id,
                            event_type="tool_result",
                            tool_name=tool_name,
                            content=res_text
                        )

                        preview_res_text = res_text if len(res_text) <= 15000 else res_text[:15000] + "\n\n[... Truncated live event payload to prevent WebSocket overflow ...]"
                        try:
                            parsed_res = json.loads(preview_res_text)
                            res_payload = {"result": parsed_res}
                        except Exception:
                            res_payload = {"result": preview_res_text}

                        self.notify_all(
                            ToolResultEvent(
                                session_id=session_id,
                                tool_name=tool_name,
                                tool_result=res_payload,
                                type="tool_result",
                                content={
                                    "tool_name": tool_name,
                                    "tool_result": res_payload,
                                    "tokens_elapsed": getattr(self, "total_tokens", 0),
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                                tokens_elapsed=getattr(self, "total_tokens", 0),
                                time_elapsed=self.get_time_elapsed(),
                            ).model_dump_json()
                        )
                        return res_text
            except Exception:
                continue

        raise ValueError(f"Tool '{tool_name}' not found on any connected MCP server.")

    def get_db_connection(self) -> sqlite3.Connection:
        """Get or create a persistent database connection to maintain a session."""
        if self._db_conn is None:
            self._db_conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._db_conn.row_factory = sqlite3.Row
        return self._db_conn

    def get_session_html(self, session_id: str) -> Optional[str]:
        """Retrieve the HTML content of a session directly from the database."""
        conn = self.get_db_connection()
        cursor = conn.cursor()
        for table_name in ["navigator_session", "navigator_sessions"]:
            try:
                cursor.execute(
                    f"SELECT html_content FROM {table_name} WHERE id = ?",
                    (session_id,)
                )
                row = cursor.fetchone()
                if row:
                    return row["html_content"]
                return None
            except sqlite3.OperationalError:
                continue
        return None


def json_schema_to_pydantic(name: str, schema: dict) -> Any:
    """Dynamically creates a Pydantic BaseModel from an MCP inputSchema."""
    properties = schema.get("properties", {})
    required_fields = schema.get("required", [])

    fields = {}
    for field_name, field_info in properties.items():
        type_str = field_info.get("type", "string")
        py_type = {
            "string": str,
            "integer": int,
            "number": float,
            "boolean": bool,
            "array": list,
            "object": dict,
        }.get(type_str, Any)

        description = field_info.get("description", "")
        default = ... if field_name in required_fields else field_info.get("default", None)
        fields[field_name] = (py_type, Field(default=default, description=description))

    return create_model(name, **fields)


__all__ = ["MCPAgent", "CentrifugoObserver", "create_centrifugo_observer", "json_schema_to_pydantic"]

