from __future__ import annotations

import time
from typing import Any, Optional

from llama_index.llms.siliconflow import SiliconFlow

from .config import LLMConfig, ProviderSettings
from .observer import Observer, Subject
from .types import LLMStreamItem


class _NoopLogger:
    def log(self, *args, **kwargs):
        pass


class BroadcastingSubject(Subject):
    """A subject subclass that automatically registers default logging and publishing observers."""

    def __init__(
        self,
        run_id: Optional[str] = None,
        logger: Optional[Any] = None,
        broadcaster: Optional[Any] = None,
    ) -> None:
        super().__init__()
        self.run_id = run_id
        self.logger = logger or _NoopLogger()
        self.broadcaster = broadcaster

        self.add_observer(Observer(self.log_observe))
        self.add_observer(Observer(self.publish_observe))

    def _emit_log(self, obj):
        if hasattr(self.logger, "log"):
            self.logger.log(obj)
        elif callable(self.logger):
            self.logger(obj)

    def log_observe(self, obj):
        self._emit_log(obj)

    def publish_observe(self, obj):
        if self.broadcaster is not None:
            self.broadcaster(self.run_id, obj)


class LLM(BroadcastingSubject):
    """LLM executor that streams response chunks and publishes updates to registered observers."""

    def __init__(self, llm_config: LLMConfig, settings: Optional[Any] = None, logger: Optional[Any] = None, broadcaster: Optional[Any] = None) -> None:
        run_id = str(llm_config.RUN_ID) if llm_config.RUN_ID is not None else None
        super().__init__(run_id=run_id, logger=logger, broadcaster=broadcaster)

        if not llm_config:
            raise ValueError("LLM config is required.")

        self.chat_store = getattr(llm_config, "chat_store", None)

        provider_settings = settings or ProviderSettings.from_env()
        base_url = getattr(provider_settings, "SILICONFLOW_BASE_URL", "") or llm_config.BASE_URL
        api_key = getattr(provider_settings, "SILICONFLOW_API_KEY", "") or llm_config.API_KEY
        model_id = getattr(provider_settings, "SILICONFLOW_MODEL_ID", "") or llm_config.MODEL_ID

        if not api_key:
            raise ValueError("SILICONFLOW_API_KEY is required.")
        if not base_url:
            raise ValueError("SILICONFLOW_BASE_URL is required.")
        if not model_id:
            raise ValueError("SILICONFLOW_MODEL_ID is required.")

        self.llm = SiliconFlow(
            api_key=api_key,
            model=model_id,
            base_url=base_url.rstrip("/") + "/chat/completions",
        )

    def run(self):
        handler = self.llm.stream_complete("Hi, Can you explain me what is a Transformer in brief.")
        st = time.perf_counter()
        for chunk in handler:
            en = time.perf_counter()
            stream_chunk = LLMStreamItem(
                run_id=self.run_id or "",
                delta=getattr(chunk, "delta", ""),
                text=getattr(chunk, "text", ""),
                time_taken=en - st,
                tokens_utilized=len(getattr(chunk, "text", "")) // 3,
            )
            self.notify_all(stream_chunk.model_dump_json())

    def log(self, *args, **kwargs):
        self._emit_log(*args, **kwargs)

    def publish(self, *args, **kwargs):
        if self.broadcaster is not None:
            self.broadcaster(*args, **kwargs)


__all__ = ["BroadcastingSubject", "LLM"]
