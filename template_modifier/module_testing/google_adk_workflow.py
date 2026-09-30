import os
import sys
import json
from pydantic import BaseModel, Field

# Attempt importing google-adk library if installed
try:
    from google.adk.agents.llm_agent import Agent
except ImportError:
    Agent = None

# SiliconFlow uses OpenAI compatible endpoints
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


# --- Tool Implementation (ADK Pattern) ---
def get_current_time(city: str) -> dict:
    """Returns the current time in a specified city."""
    return {"status": "success", "city": city, "time": "10:30 AM"}


# --- Pydantic Schemas for Structured Prediction ---
class CityTimeOutput(BaseModel):
    city: str = Field(description="The city name")
    time: str = Field(description="The current time string")
    status: str = Field(description="Status of query processing")


class CapitalOutput(BaseModel):
    country: str = Field(description="The country name")
    capital: str = Field(description="The capital city of the country")
    population_estimate: str | None = Field(default=None, description="Optional estimated population")


# --- ADK Root Agent Definition with Output Schema ---
if Agent is not None:
    root_agent = Agent(
        model=os.getenv("SILICONFLOW_MODEL_ID", "deepseek-ai/DeepSeek-V3"),
        name="root_agent",
        description="Provides structured capital city information.",
        instruction=(
            "You are a helpful assistant. Provide the capital of a given country "
            "as a JSON object strictly conforming to the output schema."
        ),
        output_schema=CapitalOutput,
        output_key="found_capital",
    )
else:
    root_agent = None


# --- SiliconFlow ADK Compatible Agent Class with Structured Predict ---
class SiliconFlowAgent:
    """
    Agent initializer configured for SiliconFlow API with support for text generation
    and structured output predictions (input_schema / output_schema).
    """
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model_id: str | None = None,
        system_instruction: str | None = None,
        tools: list | None = None,
        output_schema: type[BaseModel] | None = None,
        output_key: str | None = None,
    ):
        self.api_key = (
            api_key
            or os.getenv("SILICONFLOW_API_KEY")
            or os.getenv("GOOGLE_API_KEY")
        )
        self.base_url = (
            base_url
            or os.getenv("SILICONFLOW_BASE_URL")
            or "https://api.siliconflow.com/v1"
        )
        self.model_id = (
            model_id
            or os.getenv("SILICONFLOW_MODEL_ID")
            or "deepseek-ai/DeepSeek-V3"
        )
        self.system_instruction = system_instruction or "You are a helpful assistant."
        self.tools = tools or []
        self.output_schema = output_schema
        self.output_key = output_key
        
        self.client = self._init_client()

    def _init_client(self):
        """
        Initialize OpenAI client targeting SiliconFlow endpoint.
        """
        if OpenAI is None:
            raise RuntimeError(
                "The 'openai' python package is required for SiliconFlow API. "
                "Install it with: pip install openai"
            )
        return OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )

    def generate(self, prompt: str, **kwargs) -> str:
        """
        Generate plain text response using configured SiliconFlow endpoint.
        """
        messages = [
            {"role": "system", "content": self.system_instruction},
            {"role": "user", "content": prompt}
        ]
        
        response = self.client.chat.completions.create(
            model=self.model_id,
            messages=messages,
            **kwargs
        )
        return response.choices[0].message.content

    def predict_structured(
        self,
        prompt: str,
        response_model: type[BaseModel] | None = None,
        **kwargs
    ) -> BaseModel:
        """
        Structured prediction method: returns validated Pydantic model instance.
        """
        target_model = response_model or self.output_schema
        if target_model is None:
            raise ValueError("No response_model or output_schema provided for structured prediction.")

        schema_json = json.dumps(target_model.model_json_schema(), indent=2)
        system_prompt = (
            f"{self.system_instruction}\n\n"
            f"CRITICAL: You MUST respond ONLY with a valid JSON object matching this JSON Schema:\n"
            f"{schema_json}\n"
            f"Do not include any commentary or markdown formatting outside the JSON."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]

        # Try beta parse if available
        if hasattr(self.client, "beta") and hasattr(self.client.beta.chat.completions, "parse"):
            try:
                completion = self.client.beta.chat.completions.parse(
                    model=self.model_id,
                    messages=messages,
                    response_format=target_model,
                    **kwargs
                )
                parsed_res = completion.choices[0].message.parsed
                if parsed_res is not None:
                    return parsed_res
            except Exception:
                pass

        # Fallback to json_object response format
        response = self.client.chat.completions.create(
            model=self.model_id,
            messages=messages,
            response_format={"type": "json_object"},
            **kwargs
        )
        raw_json = response.choices[0].message.content
        return target_model.model_validate_json(raw_json)


def main():
    print("=== ADK / SiliconFlow Agent Workflow with Structured Predict ===")
    
    api_key = (
        os.getenv("SILICONFLOW_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    base_url = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.com/v1")
    model_id = os.getenv("SILICONFLOW_MODEL_ID", "deepseek-ai/DeepSeek-V3")

    print(f"Base URL: {base_url}")
    print(f"Model ID: {model_id}")

    # 1. Text Generation Example
    agent = SiliconFlowAgent(
        api_key=api_key,
        base_url=base_url,
        model_id=model_id,
        system_instruction="You are a helpful assistant.",
    )
    print("\n--- 1. Plain Text Prediction ---")
    reply = agent.generate("What is the capital of France?")
    print(f"Response: {reply}")

    # 2. Structured Prediction Example
    structured_agent = SiliconFlowAgent(
        api_key=api_key,
        base_url=base_url,
        model_id=model_id,
        system_instruction="You are a structured data extractor.",
        output_schema=CapitalOutput,
        output_key="found_capital"
    )

    print("\n--- 2. Structured Prediction (Pydantic Output) ---")
    structured_prompt = "Provide information about the capital of France."
    print(f"Query: '{structured_prompt}'")
    
    try:
        result: CapitalOutput = structured_agent.predict_structured(structured_prompt)
        print(f"\nStructured Result (Parsed Pydantic Model):")
        print(f"  Country: {result.country}")
        print(f"  Capital: {result.capital}")
        print(f"  Population Estimate: {result.population_estimate}")
        print(f"\nModel Dump JSON:\n{result.model_dump_json(indent=2)}")
    except Exception as e:
        print(f"\nStructured Prediction Error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
