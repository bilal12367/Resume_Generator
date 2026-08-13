from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Self


class ProviderSettings:
    """Plain settings container used by the standalone package.

    It intentionally avoids importing application-specific configuration modules.
    """

    def __init__(
        self,
        *,
        siliconflow_api_key: str = "",
        siliconflow_base_url: str = "",
        siliconflow_model_id: str = "",
        openrouter_api_key: str = "",
        openrouter_base_url: str = "",
        openrouter_model_id: str = "",
        centrifuge_base_url: str = "",
        centrifugo_api_key: str = "",
        **extra: Any,
    ):
        self.SILICONFLOW_API_KEY = siliconflow_api_key
        self.SILICONFLOW_BASE_URL = siliconflow_base_url
        self.SILICONFLOW_MODEL_ID = siliconflow_model_id
        self.OPENROUTER_API_KEY = openrouter_api_key
        self.OPENROUTER_BASE_URL = openrouter_base_url
        self.OPENROUTER_MODEL_ID = openrouter_model_id
        self.CENTRIFUGE_BASE_URL = centrifuge_base_url
        self.CENTRUGO_API_KEY = centrifugo_api_key
        self.extra = extra

    @classmethod
    def from_env(cls, env: Optional[Dict[str, str]] = None):
        import os
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass

        env = env or os.environ
        return cls(
            siliconflow_api_key=env.get("SILICONFLOW_API_KEY", ""),
            siliconflow_base_url=env.get("SILICONFLOW_BASE_URL", ""),
            siliconflow_model_id=env.get("SILICONFLOW_MODEL_ID", ""),
            openrouter_api_key=env.get("OPENROUTER_API_KEY", ""),
            openrouter_base_url=env.get("OPENROUTER_BASE_URL", ""),
            openrouter_model_id=env.get("OPENROUTER_MODEL_ID", ""),
            centrifuge_base_url=env.get("CENTRIFUGE_BASE_URL", ""),
            centrifugo_api_key=env.get("CENTRUGO_API_KEY", ""),
        )

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)


class LLMConfig:
    """Builder class for configuring LLM options, loggers, listeners, and execution contexts."""

    MODEL_ID: str
    BASE_URL: str
    API_KEY: str
    CENTRIFUGE_BASE_URL: Optional[str]
    CENTRIFUGE_TOKEN: Optional[str]
    LOKI_BASE_URL: Optional[str]
    LOKI_TAGS: Optional[dict]
    RUN_ID: Optional[str]

    def __init__(self):
        self.MODEL_ID = ""
        self.BASE_URL = ""
        self.API_KEY = ""
        self.CENTRIFUGE_BASE_URL = None
        self.CENTRIFUGE_TOKEN = None
        self.LOKI_BASE_URL = None
        self.LOKI_TAGS = None
        self.RUN_ID = None

    def with_llm_provider(self, base_url: str, api_key: str, model_id: str) -> Self:
        self.MODEL_ID = model_id
        self.BASE_URL = base_url
        self.API_KEY = api_key
        return self

    def with_centrifuge_listener(self, base_url: str, token: str) -> Self:
        self.CENTRIFUGE_BASE_URL = base_url
        self.CENTRIFUGE_TOKEN = token
        return self

    def with_loki_logger(self, base_url: str, tags: Optional[dict] = None) -> Self:
        self.LOKI_BASE_URL = base_url
        self.LOKI_TAGS = tags
        return self

    def with_db(self, db_uri: str):
        try:
            from llama_index.storage.chat_store.sqlite import SQLiteChatStore
        except ImportError as exc:
            raise ImportError("SQLiteChatStore requires the llama-index package to be installed.") from exc

        self.chat_store = SQLiteChatStore.from_uri(uri=db_uri)
        return self

    def with_run_id(self, run_id: str) -> Self:
        self.RUN_ID = run_id
        return self

    def build(self) -> Self:
        if not self.MODEL_ID or not self.API_KEY:
            raise Exception("LLM Config BUILDER Error: Cannot initialize without custom LLM Provider.")
        return self


class AgentConfig:
    system_prompt: Optional[str]
    provider_type: Optional[Literal["OPENROUTER", "SILICONFLOW"]]
    db_uri: Optional[str]
    table_name: Optional[str]
    token_limit: int

    def __init__(self):
        self.system_prompt = "You are a helpful assistant, use the provided tools to complete the task efficiently."
        self.provider_type = None
        self.db_uri = "sqlite:///agent_conversation.db"
        self.token_limit = 9000
        self.table_name = None

    def set_prompt(self, prompt: str) -> Self:
        self.system_prompt = prompt
        return self

    def set_provider_type(self, provider_type: Literal["OPENROUTER", "SILICONFLOW"]) -> Self:
        self.provider_type = provider_type
        return self

    def set_db_uri(self, db_uri: str) -> Self:
        self.db_uri = db_uri
        return self

    def set_token_limit(self, token_limit: int) -> Self:
        self.token_limit = token_limit
        return self

    def set_table_name(self, table_name: str) -> Self:
        self.table_name = table_name
        return self


__all__ = ["ProviderSettings", "LLMConfig", "AgentConfig"]
