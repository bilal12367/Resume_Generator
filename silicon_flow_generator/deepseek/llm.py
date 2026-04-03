import logging
from logger.config import setup_logging
from openai import OpenAI
from pydantic import BaseModel
from typing import Any
import os
from dotenv import load_dotenv

load_dotenv()

setup_logging(file_name="llm_objects.jsonl")

logger     = logging.getLogger("app")
obj_logger = logging.getLogger("app.objects")


class SiliconFlowLLM:


    def __init__(self, api_key: str = os.getenv("SILICONFLOW_API_KEY"), model: str = "deepseek-ai/DeepSeek-V3"):
        BASE_URL = "https://api.siliconflow.com/v1"
        self.model  = model

        self.client = OpenAI(api_key=api_key, base_url=BASE_URL )
        logger.info(f"SiliconFlowLLM initialised {api_key} | model={model}")

    def call(
        self,
        messages: list[dict] = [],
        user_prompt: str = None,
        system_prompt: str = 'You are a helpful assistant.',
        output_schema: type[BaseModel] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> str | BaseModel:
        logger.info(f"LLM call | schema={output_schema.__name__ if output_schema else None}")

        try:
            if len(messages) == 0 and user_prompt is None:
                raise ValueError("Either messages or user_prompt must be provided.")
            
            if len(messages) == 0:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ]
            if output_schema:
                response = self.client.beta.chat.completions.parse(
                    model=self.model,
                    messages=messages,
                    response_format=output_schema,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                parsed = response.choices[0].message.parsed
                logger.info(f"Structured response received | schema={output_schema.__name__}")
                obj_logger.info("structured_output", extra={"data": parsed.model_dump()})
                return parsed                          # ← Pydantic instance

            else:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                content = response.choices[0].message.content
                logger.info("Plain response received")
                return content                        # ← plain str

        except Exception as e:
            logger.error(f"LLM call failed | error={e}")
            raise



# llm = SiliconFlowLLM()

# resp = llm.call(user_prompt="Hello, how are you?" )
# print(resp)