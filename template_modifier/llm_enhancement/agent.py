from __future__ import annotations

import time
from typing import Any, Callable, List, Optional

from llama_index.core import Settings
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.core.tools import FunctionTool
from llama_index.storage.chat_store.sqlite import SQLiteChatStore
from llama_index.llms.siliconflow import SiliconFlow

from .config import AgentConfig, ProviderSettings
from .observer import Subject
from .types import DeltaEvent, RunCompletionEvent, ToolCallEvent, ToolResultEvent


class Agent(Subject):
    def __init__(
        self,
        agent_config: AgentConfig,
        tools: Optional[List[Callable]] = None,
        run_id: Optional[str] = None,
        settings: Optional[Any] = None,
        logger: Optional[Any] = None,
    ):
        if not agent_config:
            raise ValueError("Agent Config must be provided.")

        if not agent_config.provider_type:
            raise ValueError("Agent Config Error: provider_type is required.")

        provider = agent_config.provider_type.upper()
        if provider not in ("OPENROUTER", "SILICONFLOW"):
            raise ValueError(f"Agent Config Error: Unsupported provider_type '{provider}'.")

        provider_settings = settings or ProviderSettings.from_env()
        if provider == "SILICONFLOW":
            base_url = getattr(provider_settings, "SILICONFLOW_BASE_URL", "")
            api_key = getattr(provider_settings, "SILICONFLOW_API_KEY", "")
            model_id = getattr(provider_settings, "SILICONFLOW_MODEL_ID", "")
        else:
            base_url = getattr(provider_settings, "OPENROUTER_BASE_URL", "")
            api_key = getattr(provider_settings, "OPENROUTER_API_KEY", "")
            model_id = getattr(provider_settings, "OPENROUTER_MODEL_ID", "")
        
        if not api_key:
            raise ValueError(f"Agent Config Error: API key is missing for provider {provider}.")
        if not base_url:
            raise ValueError(f"Agent Config Error: Base URL is missing for provider {provider}.")
        if not model_id:
            raise ValueError(f"Agent Config Error: Model ID is missing for provider {provider}.")

        if not agent_config.db_uri:
            raise ValueError("Agent Config Error: db_uri is required.")
        if agent_config.token_limit is None or agent_config.token_limit <= 0:
            raise ValueError("Agent Config Error: token_limit must be a positive integer.")

        table_name = agent_config.table_name if agent_config.table_name else "datastore"
        self._system_prompt = agent_config.system_prompt or "You are a helpful assistant."
        self._tools = []
        self.db_uri = agent_config.db_uri
        self.token_limit = agent_config.token_limit
        self.start_time = None
        self.run_id = run_id
        self.logger = logger or self._default_logger()

        full_base_url = base_url
        if not full_base_url.endswith("/chat/completions"):
            full_base_url = full_base_url.rstrip("/") + "/chat/completions"

        self.llm = SiliconFlow(
            base_url=full_base_url,
            api_key=api_key,
            model=model_id,
            max_tokens=20000,
        )

        self.chat_store = SQLiteChatStore.from_uri(uri=self.db_uri, table_name=table_name)
        super().__init__()

        if self.db_uri.startswith("sqlite:///"):
            self.db_path = self.db_uri[len("sqlite:///"):]
        else:
            self.db_path = self.db_uri

        Settings.llm = self.llm
        self.system_prompt = agent_config.system_prompt
        self.tools = tools or []

    @staticmethod
    def _default_logger():
        class _Logger:
            def log(self, *args, **kwargs):
                pass

        return _Logger()

    def _log(self, message: str):
        if hasattr(self.logger, "log"):
            self.logger.log(message)
        elif callable(self.logger):
            self.logger(message)

    @property
    def system_prompt(self) -> str:
        return self._system_prompt

    @system_prompt.setter
    def system_prompt(self, val: Optional[str]):
        self._system_prompt = val or "You are a helpful assistant."
        self._update_agent_runner()

    @property
    def tools(self) -> list:
        return self._tools

    @tools.setter
    def tools(self, val: list):
        self._tools = [
            FunctionTool.from_defaults(fn=t) if callable(t) and not isinstance(t, FunctionTool) else t
            for t in val
        ]
        self._update_agent_runner()

    def _update_agent_runner(self):
        if hasattr(self, "llm") and self.llm:
            from llama_index.core.agent.workflow import ReActAgent

            self.agent = ReActAgent(
                tools=self._tools,
                llm=self.llm,
                verbose=True,
                system_prompt=self._system_prompt,
                max_iterations=35,
                timeout=None,
            )

    def custom_tokenizer(self, text: str, flag = 0):
        return [0] * (len(text) // 3) if flag == 0 else (len(text) // 3)

    def _get_memory_buffer(self, session_id: str) -> ChatMemoryBuffer:
        return ChatMemoryBuffer.from_defaults(
            token_limit=self.token_limit,
            chat_store=self.chat_store,
            chat_store_key=session_id,
            tokenizer_fn=self.custom_tokenizer,
        )

    def _init_memory_if_empty(
        self,
        memory: ChatMemoryBuffer,
        session_id: str,
        system_prompt: Optional[str],
    ):
        existing_history = memory.get_all()
        if not existing_history:
            self._log(f"Session {session_id} is new. Initializing with system prompt.")
            initial_prompt = system_prompt or self.system_prompt or "You are a helpful assistant."
            memory.put(ChatMessage(role=MessageRole.SYSTEM, content=initial_prompt))
        else:
            self._log(f"Continuing existing session {session_id} with {len(existing_history)} messages.")

    def _save_tool_event(self, session_id: str, event_type: str, tool_name: str, content: str):
        """Save a tool call or result to the database."""
        import sqlite3
        import datetime
        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tool_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT,
                    event_type TEXT,
                    tool_name TEXT,
                    content TEXT,
                    timestamp TEXT
                )
            """)
            timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cursor.execute("""
                INSERT INTO tool_events (session_id, event_type, tool_name, content, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """, (session_id, event_type, tool_name, content, timestamp))
            conn.commit()
            conn.close()
        except Exception as e:
            self._log(f"Failed to save tool event to DB: {e}")

    def get_time_elapsed(self) -> float:
        if getattr(self, "start_time", None) is not None:
            return time.time() - self.start_time
        return 0.0

    async def chat(self, new_message: str, system_prompt: Optional[str] = None):
        self.start_time = time.time()
        try:
            self._log(f"Received message for session_id={self.run_id}: {new_message}")

            memory = self._get_memory_buffer(self.run_id)
            self._init_memory_if_empty(memory, self.run_id, system_prompt)
            handler = self.agent.run(user_msg=new_message, memory=memory, max_iterations=60)

            chat_history_tokens = memory._token_count_for_messages(memory.get_all())
            new_message_tokens = self.custom_tokenizer(new_message, flag=1)
            prompt_tokens = chat_history_tokens + new_message_tokens
            completion_tokens = 0
            self.total_tokens = 0
            message_type = "Thinking"

            async for event in handler.stream_events():
                event_type = type(event).__name__
                if event_type == "AgentStream":
                    delta = getattr(event, "delta", "")
                    completion_tokens += self.custom_tokenizer(delta, flag = 1)
                    self.total_tokens = prompt_tokens + completion_tokens
                    if "Thought" in delta:
                        message_type = "Thinking"
                    elif "Action" in delta:
                        message_type = "Tool_Call"
                    elif "Observation" in delta:
                        message_type = "Tool_Result_Thinking"
                    elif "Answer" in delta or "Final Answer" in delta:
                        message_type = "Answering"
                    delta_evt = DeltaEvent(
                        delta=delta,
                        session_id=self.run_id,
                        type="text",
                        messageType=message_type,
                        usage_metadata={
                            "prompt_token": prompt_tokens,
                            "completion_token": completion_tokens,
                            "total_tokens": self.total_tokens,
                        },
                    )
                    yield delta_evt
                elif event_type == "ToolCall":
                    tool_call_evt = ToolCallEvent(
                        session_id=self.run_id,
                        tool_name=getattr(event, "tool_name", "unknown"),
                        tool_kwargs=getattr(event, "tool_kwargs", {}),
                        content={
                            "tool_name": getattr(event, "tool_name", "unknown"),
                            "tool_kwargs": getattr(event, "tool_kwargs", {}),
                            "tokens_elapsed": self.total_tokens,
                            "time_elapsed": self.get_time_elapsed(),
                        },
                    )
                    import json
                    self._save_tool_event(
                        session_id=self.run_id,
                        event_type="tool_call",
                        tool_name=getattr(event, "tool_name", "unknown"),
                        content=json.dumps(getattr(event, "tool_kwargs", {}))
                    )
                    self.notify_all(tool_call_evt.model_dump_json())
                    yield tool_call_evt

                elif event_type == "ToolCallResult":
                    tool_result_evt = ToolResultEvent(
                        session_id=self.run_id,
                        tool_name=getattr(event, "tool_name", "unknown"),
                        tool_result=getattr(event, "tool_result", {}),
                        content={
                            "tool_name": getattr(event, "tool_name", "unknown"),
                            "tool_result": str(getattr(event.tool_output, "content", "")),
                            "tokens_elapsed": self.total_tokens,
                            "time_elapsed": self.get_time_elapsed(),
                        },
                    )
                    self._save_tool_event(
                        session_id=self.run_id,
                        event_type="tool_result",
                        tool_name=getattr(event, "tool_name", "unknown"),
                        content=str(getattr(event.tool_output, "content", ""))
                    )
                    self.notify_all(tool_result_evt.model_dump_json())
                    yield tool_result_evt

            resp = await handler
            yield RunCompletionEvent(session_id=self.run_id, content=resp.response.content)
        except Exception as exc:
            self._log(f"Agent execution failed for session {self.run_id}: {str(exc)}")
            raise exc


__all__ = ["Agent"]
