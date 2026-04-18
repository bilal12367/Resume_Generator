"""
llm.py
------
A clean LLM wrapper around the SiliconFlow API (OpenAI-compatible).

Supports two calling modes:
  1. Prompt mode  — pass system_prompt + user_prompt
  2. Messages mode — pass a raw list of {"role": ..., "content": ...} dicts

Environment variables (put these in your .env file):
  SILICONFLOW_API_KEY   — required
  SILICONFLOW_BASE_URL  — optional, defaults to https://api.siliconflow.cn/v1
  SILICONFLOW_MODEL     — optional, defaults to meta-llama/Meta-Llama-3.1-8B-Instruct
"""

import os
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI

import logging, time
logging.basicConfig(level=logging.INFO)

load_dotenv()
from datetime import datetime
import json
from config.env_settings import settings

def log( message):
    file_path='test.log'
    """Appends a single JSON log entry to a .jsonl file."""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "level": 'DEBUG',
        "message": message,
        # **extra_fields  # Allows passing arbitrary data
    }
    
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry) + "\n")

class LLMUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    message: str
    total_time_taken: str

class LLMConfig:
    """
    Holds all LLM generation parameters.
    Keeps them separate from the client credentials so they can be
    overridden per-call without rebuilding the client.
    """

    def __init__(
        self,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 1024,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        stream: bool = False,
    ):
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.frequency_penalty = frequency_penalty
        self.presence_penalty = presence_penalty
        self.stream = stream


class LLM:

    def __init__(self, config: Optional[LLMConfig] = None):
        # ── Credentials from environment ───────────────────────────────
        self.api_key: str = settings.SILICONFLOW_API_KEY  # raises if missing
        self.base_url: str = settings.SILICONFLOW_BASE_URL
        self.model: str = settings.MODEL_ID

        self.usage = None

        # ── Default generation config ──────────────────────────────────
        self.config: LLMConfig = config or LLMConfig()

        # ── OpenAI-compatible client ───────────────────────────────────
        self._client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    
    def metric_calc( func):
        def wrapper(self, *args, **kwargs):
            start_time = time.perf_counter()
            resp = func(self, *args, **kwargs)
            end_time = time.perf_counter()
            log(
                {
                    'execution_time': f"{end_time - start_time:.6f} seconds",
                    'completion_tokens': self.usage.completion_tokens,
                    'prompt_tokens': self.usage.prompt_tokens,
                    'total_tokens': self.usage.total_tokens
                }
            )
            # exec_time = f"{end_time-start_time:.4f} seconds"
            return resp
        return wrapper


    
    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------


    @metric_calc
    def call(
        self,
        # -- Prompt mode --
        user_prompt: Optional[str] = None,
        system_prompt: Optional[str] = None,
        # -- Messages mode --
        messages: Optional[list[dict]] = None,
        # -- Per-call config overrides --
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
        frequency_penalty: Optional[float] = None,
        presence_penalty: Optional[float] = None,
        stream: Optional[bool] = None,
    ) -> str:
        """
        Call the LLM and return the response text.

        Either provide (user_prompt) with an optional system_prompt,
        OR provide a fully constructed messages list — not both.
        """
        resolved_messages = self._resolve_messages(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            messages=messages,
        )

        response = self._client.chat.completions.create(
            model=self.model,
            messages=resolved_messages,
            temperature=temperature       if temperature       is not None else self.config.temperature,
            top_p=top_p                   if top_p             is not None else self.config.top_p,
            max_tokens=max_tokens         if max_tokens        is not None else self.config.max_tokens,
            frequency_penalty=frequency_penalty if frequency_penalty is not None else self.config.frequency_penalty,
            presence_penalty=presence_penalty   if presence_penalty  is not None else self.config.presence_penalty,
            stream=stream                 if stream            is not None else self.config.stream,
        )

        self.usage = response.usage

        return response.choices[0].message.content or ""

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _resolve_messages(
        self,
        user_prompt: Optional[str],
        system_prompt: Optional[str],
        messages: Optional[list[dict]],
    ) -> list[dict]:
        """
        Validates inputs and returns a well-formed messages list.

        Rules:
          - messages and (user_prompt / system_prompt) are mutually exclusive.
          - In prompt mode, user_prompt is required; system_prompt is optional.
          - In messages mode, at least one message must exist.
        """
        
        using_prompt_mode = user_prompt is not None or system_prompt is not None
        using_messages_mode = messages is not None

        logging.error(f" Using prompt mode: {using_prompt_mode}, message mode: {using_messages_mode}")

        if using_prompt_mode and using_messages_mode:
            raise ValueError(
                "Provide either (user_prompt / system_prompt) OR messages — not both."
            )

        if not using_prompt_mode and not using_messages_mode:
            raise ValueError(
                "You must provide either user_prompt or a messages list."
            )

        # ── Messages mode ──────────────────────────────────────────────
        if using_messages_mode:
            if not messages:
                raise ValueError("messages list must not be empty.")
            return messages

        # ── Prompt mode ────────────────────────────────────────────────
        if user_prompt is None:
            raise ValueError(
                "user_prompt is required when using prompt mode. "
                "system_prompt alone is not enough."
            )

        result = []
        if system_prompt:
            result.append({"role": "system", "content": system_prompt})
        result.append({"role": "user", "content": user_prompt})
        return result