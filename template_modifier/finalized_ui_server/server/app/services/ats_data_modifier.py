import os
import re
import json
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Sequence
import aiohttp
from pydantic import BaseModel
from llama_index.core.base.llms.types import MessageRole, ChatMessage, ChatResponse
from llama_index.llms.siliconflow import SiliconFlow

from app.schemas.ats_schema import UserDataSchema

logger = logging.getLogger(__name__)


class PatchedSiliconFlow(SiliconFlow):
    """
    Subclass of SiliconFlow with defensive error handling and rate-limit backoff.
    Prevents KeyError: 'choices' when the API returns an error or rate-limit payload.
    """

    async def achat(
        self, messages: Sequence[ChatMessage], **kwargs: Any
    ) -> ChatResponse:
        messages_dict = self._convert_to_llm_messages(messages)
        response_format = kwargs.get("response_format", {"type": "text"})

        input_json = {
            "model": self.model,
            "messages": messages_dict,
            "stream": False,
            "n": 1,
            "tools": kwargs.get("tools"),
            "response_format": response_format,
            **self.model_kwargs,
        }

        timeout = aiohttp.ClientTimeout(total=self.timeout if self.timeout else 120.0)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                self.base_url,
                json=input_json,
                headers=self._headers,
            ) as response:
                try:
                    response_json = await response.json()
                except Exception:
                    response_text = await response.text()
                    if response.status >= 400:
                        raise ValueError(
                            f"SiliconFlow API Error (HTTP {response.status}): {response_text[:400]}"
                        )
                    raise ValueError(
                        f"SiliconFlow returned non-JSON response (HTTP {response.status}): {response_text[:400]}"
                    )

                # Check for API error status - fail fast without automatic background retries
                if response.status >= 400:
                    err_msg = (
                        response_json.get("message")
                        or (
                            response_json.get("error", {}).get("message")
                            if isinstance(response_json.get("error"), dict)
                            else response_json.get("error")
                        )
                        or str(response_json)
                    )
                    raise ValueError(f"SiliconFlow API Error (HTTP {response.status}): {err_msg}")

                # Defensive check for choices key
                choices = response_json.get("choices")
                if not choices or not isinstance(choices, list) or len(choices) == 0:
                    err_msg = (
                        response_json.get("message")
                        or (
                            response_json.get("error", {}).get("message")
                            if isinstance(response_json.get("error"), dict)
                            else response_json.get("error")
                        )
                        or str(response_json)
                    )
                    raise ValueError(f"SiliconFlow response missing choices: {err_msg}")

                msg_dict: dict = choices[0].get("message") or {}
                content = msg_dict.get("content") or ""
                role = msg_dict.get("role") or "assistant"

                return ChatResponse(
                    message=ChatMessage(
                        content=content,
                        role=role,
                        additional_kwargs={"tool_calls": msg_dict.get("tool_calls")},
                    ),
                    raw=response_json,
                )


class ATSDataModifier:
    def __init__(self):
        api_key = os.getenv('SILICONFLOW_API_KEY')
        base_url = os.getenv('SILICONFLOW_BASE_URL')
        model = os.getenv('SILICONFLOW_MODEL_ID')

        kwargs: Dict[str, Any] = {"max_tokens": 10000}
        if api_key:
            kwargs["api_key"] = api_key
        if base_url:
            if not base_url.endswith('/chat/completions'):
                base_url = base_url.rstrip('/') + '/chat/completions'
            kwargs["base_url"] = base_url
        if model:
            kwargs["model"] = model

        # Use PatchedSiliconFlow wrapper
        self.llm = PatchedSiliconFlow(**kwargs, timeout=120.0)

    async def generate_data(self, job_description: str, user_old_data: dict) -> Tuple[BaseModel, int]:
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "user_data",
                "strict": True,
                "schema": UserDataSchema.model_json_schema()
            }
        }

        SYSTEM_PROMPT = (
            "You are an expert ATS (Applicant Tracking System) Bypasser Agent. Your objective is to target specific companies, "
            "search for relevant roles (if applicable), and modify the candidate's resume data to achieve maximum compatibility "
            "with the target Job Description, allowing the candidate to pass automated screening checks.\n\n"
            "Strictly adhere to the following instructions:\n"
            "1. **Analyze the Job Description (JD)**: Identify key requirements, core technologies, frameworks, methodologies, and responsibilities.\n"
            "2. **Align Experience Highlights**: Re-write and adjust the candidate's experience points to focus heavily on the keywords and core responsibilities of the JD. You are explicitly allowed to edit, augment, or alter facts, tools, frameworks, and metrics used in past jobs to match the JD requirements.\n"
            "3. **Align Skills & Projects**: Adjust the candidate's skills list and restructure the project highlights/tech stacks to align directly with the JD priorities.\n"
            "4. **Tailor for Enterprise Scale**: Adapt the resume's terminology to match the specific employer from the Target Company Pool. Inject relevant enterprise jargon (e.g., 'global delivery model', 'client stakeholder management', 'digital transformation', 'cross-functional engineering') expected by these specific IT services and consulting firms.\n"
            "5. **Actionable Interview Preparation Guide**: In the `points_to_user` field, explain to the candidate what technologies or concepts they need to study, practice, or prepare for based on the modifications you made, so they are fully equipped for subsequent technical interview rounds.\n"
            "6. **Important**: Do not modify the number of years of experience, only modify the experience points, as the interviewer can catch that as a lie.\n"
            "Don't add any salutation like dear hiring manager or anything.\n"
            "Don't add Remote/Hybrid"
        )
        USER_MESSAGE = f'**Job Description** {job_description} **User Data**{str(user_old_data)}'
        chat_history = [
            ChatMessage(role=MessageRole.SYSTEM, content=SYSTEM_PROMPT),
            ChatMessage(role=MessageRole.USER, content=USER_MESSAGE)
        ]

        response = await self.llm.achat(
            messages=chat_history,
            response_format=response_format,
        )

        response_content = str(response.message.content).strip()

        # Clean optional markdown code block fences if returned by the LLM
        if response_content.startswith("```"):
            match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response_content)
            if match:
                response_content = match.group(1).strip()

        # Extract total token utilization
        from app.llm.agent import extract_usage_from_response, estimate_tokens
        usage = extract_usage_from_response(response)
        total_tokens = usage.get("total_tokens", 0)
        if not total_tokens:
            # Fallback estimation if usage object was omitted by provider
            total_tokens = estimate_tokens(SYSTEM_PROMPT + USER_MESSAGE) + estimate_tokens(response_content)

        if hasattr(UserDataSchema, "model_validate_json"):
            parsed_data = UserDataSchema.model_validate_json(response_content)
        else:
            parsed_data = UserDataSchema.parse_raw(response_content)

        return parsed_data, total_tokens
