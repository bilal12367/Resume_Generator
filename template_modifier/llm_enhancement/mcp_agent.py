from __future__ import annotations

from typing import Any, Callable, List, Optional

from llama_index.core.tools import FunctionTool
from pydantic import Field, create_model

from .agent import Agent
from .config import AgentConfig
from .observer import Subject
from llm.events import ToolCallEvent, ToolResultEvent


class MCPAgent(Agent):
    """Agent subclass that dynamically fetches tools from external MCP server URLs,
    binds them to LlamaIndex, and exposes active MCP ClientSession connections.
    """

    def __init__(
        self,
        agent_config: AgentConfig,
        mcp_urls: List[str] = [],
        tools: List[Callable] = [],
        run_id: Optional[str] = None,
    ):
        self.mcp_urls = mcp_urls
        self.mcp_sessions = []
        self._exit_stack = None
        self.total_tokens = 0
        super().__init__(agent_config=agent_config, tools=tools, run_id=run_id)

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
        all_tools = list(self.tools)

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

                    async def make_tool_call(tool_name_captured=tool_name, session_captured=session, **kwargs):
                        self.notify_all(
                            ToolCallEvent(
                                session_id=self.run_id or "unknown",
                                tool_name=tool_name_captured,
                                tool_kwargs=kwargs,
                                content={
                                    "tool_name": tool_name_captured,
                                    "tool_kwargs": kwargs,
                                    "total_tokens": self.total_tokens,
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                            ).model_dump_json()
                        )

                        res = await session_captured.call_tool(tool_name_captured, arguments=kwargs)
                        res_text = ""
                        if res.content and len(res.content) > 0:
                            res_text = res.content[0].text

                        self.notify_all(
                            ToolResultEvent(
                                session_id=self.run_id or "unknown",
                                tool_name=tool_name_captured,
                                tool_result={"result": res_text},
                                content={
                                    "tool_name": tool_name_captured,
                                    "tool_result": res_text,
                                    "total_tokens": self.total_tokens,
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                            ).model_dump_json()
                        )
                        return res_text

                    make_tool_call.__name__ = tool_name
                    make_tool_call.__doc__ = tool_description

                    pydantic_model = json_schema_to_pydantic(f"{tool_name}_schema", mcp_tool.inputSchema)
                    tool = FunctionTool.from_defaults(
                        fn=make_tool_call,
                        name=tool_name,
                        description=tool_description,
                        fn_schema=pydantic_model,
                    )
                    all_tools.append(tool)

            self.tools = all_tools
            self.logger.log(f"MCPAgent connected to {len(self.mcp_urls)} server(s). Dynamic tool binding completed.")
        except Exception as e:
            await self.disconnect_mcp()
            raise e

    async def disconnect_mcp(self):
        if self._exit_stack:
            await self._exit_stack.aclose()
            self._exit_stack = None
        self.mcp_sessions = []

    async def call_tool_manually(self, tool_name: str, arguments: dict = None) -> Any:
        """Call a connected MCP tool by name with the given arguments manually."""
        arguments = arguments or {}

        for tool in self.tools:
            if tool.metadata.name == tool_name:
                self.notify_all(
                    ToolCallEvent(
                        session_id=self.run_id or "unknown",
                        tool_name=tool_name,
                        tool_kwargs=arguments,
                        content={
                            "tool_name": tool_name,
                            "tool_kwargs": arguments,
                            "tokens_elapsed": getattr(self, "total_tokens", 0),
                            "time_elapsed": self.get_time_elapsed(),
                        },
                    ).model_dump_json()
                )

                res = await tool.acall(**arguments)
                self.notify_all(
                    ToolResultEvent(
                        session_id=self.run_id or "unknown",
                        tool_name=tool_name,
                        tool_result={"result": str(res.content)},
                        content={
                            "tool_name": tool_name,
                            "tool_result": str(res.content),
                            "tokens_elapsed": getattr(self, "total_tokens", 0),
                            "time_elapsed": self.get_time_elapsed(),
                        },
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
                                session_id=self.run_id or "unknown",
                                tool_name=tool_name,
                                tool_kwargs=arguments,
                                content={
                                    "tool_name": tool_name,
                                    "tool_kwargs": arguments,
                                    "tokens_elapsed": getattr(self, "total_tokens", 0),
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                            ).model_dump_json()
                        )

                        res = await session.call_tool(tool_name, arguments=arguments)
                        res_text = ""
                        if res.content and len(res.content) > 0:
                            res_text = res.content[0].text

                        self.notify_all(
                            ToolResultEvent(
                                session_id=self.run_id or "unknown",
                                tool_name=tool_name,
                                tool_result={"result": res_text},
                                content={
                                    "tool_name": tool_name,
                                    "tool_result": res_text,
                                    "tokens_elapsed": getattr(self, "total_tokens", 0),
                                    "time_elapsed": self.get_time_elapsed(),
                                },
                            ).model_dump_json()
                        )
                        return res_text
            except Exception:
                continue

        raise ValueError(f"Tool '{tool_name}' not found on any connected MCP server.")

    def get_session_html(self, session_id: str) -> Optional[str]:
        """Retrieve the HTML content of a session directly from the database."""
        from db.connection import SessionLocal
        from db.navigator_session import NavigatorSession

        db = SessionLocal()
        try:
            session = db.query(NavigatorSession).filter(NavigatorSession.id == session_id).first()
            if session:
                return session.html_content
            return None
        finally:
            db.close()


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


__all__ = ["MCPAgent", "json_schema_to_pydantic"]
