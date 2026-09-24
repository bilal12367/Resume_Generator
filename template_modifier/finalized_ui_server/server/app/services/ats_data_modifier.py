import os
import json
import asyncio
from pathlib import Path
from typing import Dict, Any
from pydantic import BaseModel
from llama_index.core.base.llms.types import MessageRole, ChatMessage
from llama_index.llms.siliconflow import SiliconFlow

from app.schemas.ats_schema import UserDataSchema


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

        self.llm = SiliconFlow(**kwargs, timeout=12000.0)

    async def generate_data(self, job_description: str, user_old_data: dict) -> BaseModel:
        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "user_data",
                "strict": True,
                "schema": UserDataSchema.model_json_schema()
            }
        }
        SYSTEM_PROMPT = (
            "You are an expert ATS (Applicant Tracking System) Bypasser Agent. Your objective is to modify "
            "the candidate's resume data to achieve maximum compatibility with the target Job Description, "
            "allowing the candidate to pass automated screening checks.\n\n"
            "Strictly adhere to the following instructions:\n"
            "1. **Analyze the Job Description (JD)**: Identify key requirements, core technologies, frameworks, methodologies, and responsibilities.\n"
            "2. **Align Experience Highlights**: Re-write and adjust the candidate's experience points to focus heavily on the keywords and core responsibilities of the JD. You are explicitly allowed to edit, augment, or alter facts, tools, frameworks, and metrics used in past jobs to match the JD requirements.\n"
            "3. **Align Skills & Projects**: Adjust the candidate's skills list and restructure the project highlights/tech stacks to align directly with the JD priorities.\n"
            "4. **Actionable Interview Preparation Guide**: In the `points_to_user` field, explain to the candidate what technologies or concepts they need to study, practice, or prepare for based on the modifications you made, so they are fully equipped for subsequent technical interview rounds.\n"
            "5. **Important**: Do not modify the number of years of experience, only modify the experience points, as the interviewer can catch that as a lie."
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

        response_content = str(response.message.content)

        if hasattr(UserDataSchema, "model_validate_json"):
            return UserDataSchema.model_validate_json(response_content)
        else:
            return UserDataSchema.parse_raw(response_content)
