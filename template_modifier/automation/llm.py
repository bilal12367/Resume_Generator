from llama_index.core.base.llms.types import MessageRole
from llama_index.core.base.llms.types import ChatMessage
import asyncio
import json
import os
import re
from typing import Optional
import uuid

from llama_index.llms.siliconflow import SiliconFlow
from pydantic import BaseModel

from .types import ResumeSchema


USER_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'user_data')


def save_output(json_str: str, filename: str | None = None) -> str:
    """Save LLM output JSON to user_data/ directory.
    
    If no filename is provided, derives one from personal_details.name.
    Returns the path of the saved file.
    """
    data = json.loads(json_str)

    if filename is None:
        name = data.get('personal_details', {}).get('name', 'unknown')
        # Sanitize: lowercase, replace spaces/special chars with underscores
        safe_name = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
        filename = f"{safe_name}.json"

    out_path = os.path.join(USER_DATA_DIR, filename)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_path


class LLM:
    def __init__(self) -> None:
        pass

    async def chat_structured(
        self,
        user_data: str,
        job_description: str,
        session_id: Optional[str] = str(uuid.uuid4())
    ) -> BaseModel:
        llm = SiliconFlow(
                base_url=os.getenv('SILICONFLOW_BASE_URL', '') + "/chat/completions",
                api_key=os.getenv('SILICONFLOW_API_KEY', ''),
                model=os.getenv('SILICONFLOW_MODEL_ID', ''),
                temperature=0.3,
                max_tokens=10000,
                timeout=300.0
            )
        prompt = f'''
        You are ATS bypasser Agent. You will be given Job Description and User data.
        Your task is to analyze the complete job description and the user data.
        Then you have to modify the given user data in such a way, it would match the job description.
        You should modify user data in such a way, the ATS filter should allow and mark it as valid.
        Along with you should provide the user some instructions on which parts, the initial user data lacks.
        Which skills the user has to learn and improve to be matched with this job description.
        - Analyze the job description and given user data.
        - Modify the user data and output it.
        - Give points on which user has to improve.
        '''
        user_prompt = '''
        **USER DATA**
        {user_data}
        
        **Job Description**
        {job_description}
        '''
        schema = ResumeSchema.model_json_schema()

        response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "Resume Schema",
                "strict": True,
                "schema": schema
            }
        }
        response = await llm.achat(
            messages=[
                ChatMessage(role=MessageRole.SYSTEM,content=prompt),
                ChatMessage(role=MessageRole.USER, content=user_prompt)
            ],
            response_format=response_format
        )

        response_content = str(response.message.content)
        if hasattr(ResumeSchema, "model_validate_json"):
            return ResumeSchema.model_validate_json(response_content)
        else:
            return ResumeSchema.parse_raw(response_content)


if __name__ == '__main__':
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

    llm_instance = LLM()
    with open(os.path.join(USER_DATA_DIR, 'bilal_resume_data_ai.json'), 'r') as f:
        user_data = f.read()

    job_description = '''
        4+ years of Python development experience.2+ years of experience with Azure AI services.
        2+ years of hands-on experience delivering Generative AI (GenAI) projects.
        Experience using GenAI libraries/frameworks (e.g., LangChain, Semantic Kernel, CrewAI).
        Understanding of business principles and practices; able to assess the business potential of GenAI use cases.
        Ability to contribute to business strategy development for GenAI initiatives.
        Strong understanding of ethical considerations for GenAI; able to support implementation of responsible-use guidelines.
        Ability to collaborate with users/stakeholders to gather inputs for ethical and responsible GenAI use.
        Quality-focused; able to adopt standards and consistently work to them.
        Demonstrates innovative thinking and continuous-improvement mindset.
        Comfortable discussing workload, issues, and risks; challenges the team to broaden thinking on applications and solutions.
        Operate and maintain: support production issues for existing projects alongside ongoing initiatives.
        Standards and documentation: accountable for creating and maintaining key standards, documentation, and processes for delivered projects.
        AI-assisted delivery: Comfortable using AI-assisted delivery tools (e.g., coding/documentation copilots) to improve productivity while following governance and quality standards.
    '''

    result = asyncio.run(llm_instance.chat_structured(user_data, job_description))
    saved = save_output(result.model_dump_json())
    print(f"Saved to: {saved}")
