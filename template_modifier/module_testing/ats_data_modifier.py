

from pydantic import BaseModel
from llama_index.core.base.llms.types import MessageRole
from llama_index.core.base.llms.types import ChatMessage
import os
import json
import asyncio
from pathlib import Path
from module_testing.schemas import UserDataSchema
from dotenv import load_dotenv
load_dotenv()

from llama_index.llms.siliconflow import SiliconFlow
class ATSDataModifier:
    def __init__(self):
        api_key = os.getenv('SILICONFLOW_API_KEY')
        base_url = os.getenv('SILICONFLOW_BASE_URL')
        model = os.getenv('SILICONFLOW_MODEL_ID')

        kwargs = {"max_tokens": 10000}
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
        
        # schema = UserDataSchema.model_json_schema() if hasattr(UserDataSchema, "model_json_schema") else UserDataSchema.schema()

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

# async def main():
#     # Resolve project path relative to this file
#     base_dir = Path(__file__).resolve().parent.parent
#     data_path = base_dir / 'user_data' / 'bilal_resume_data_ai.json'

#     # Load candidate old data
#     print(f"Reading user data from: {data_path}")
#     with open(data_path, 'r', encoding='utf-8') as f:
#         user_old_data = json.load(f)

#     # Define a test Job Description
#     job_description = '''
#         Job description
#         SUMMARY
#         Are you a Software professional with deep technical expertise and a passion for coming up with innovative solutions?  Do you thrive on developing and motivating others?  If so, you may be a good fit.  At Deloitte, we provide solutions using an approach designed to provide the flexibility to serve the unique circumstances and complexities of Job. As a developer, you'll assist in the developing of the client requirements that aim to exceed client expectations.
#         Work you’ll do
#         It is an integral part of the Technology teams. The principle focus of this organization is the development and maintenance of technology solutions that e-enable the delivery of Function and Marketplace Services and Management Information Systems. The team develops and maintains solutions built on varied technologies. It has various groups which provide the best of the breed solutions to the clients by following a streamlined system development methodology. It comprises of groups like Usability, Application Architecture, Development and Quality Assurance and BA teams.

        

        

#         Qualifications:

#         4+ years of Python development experience.

#         2+ years of experience with Azure AI services.

#         2+ years of hands-on experience delivering Generative AI (GenAI) projects.

#         Experience using GenAI libraries/frameworks (e.g., LangChain, Semantic Kernel, CrewAI).

#         Understanding of business principles and practices; able to assess the business potential of GenAI use cases.

#         Ability to contribute to business strategy development for GenAI initiatives.

#         Strong understanding of ethical considerations for GenAI; able to support implementation of responsible-use guidelines.

#         Ability to collaborate with users/stakeholders to gather inputs for ethical and responsible GenAI use.

#         Quality-focused; able to adopt standards and consistently work to them.

#         Demonstrates innovative thinking and continuous-improvement mindset.

#         Comfortable discussing workload, issues, and risks; challenges the team to broaden thinking on applications and solutions.

#         Operate and maintain: support production issues for existing projects alongside ongoing initiatives.

#         Standards and documentation: accountable for creating and maintaining key standards, documentation, and processes for delivered projects.

#         AI-assisted delivery: Comfortable using AI-assisted delivery tools (e.g., coding/documentation copilots) to improve productivity while following governance and quality standards.

#         Experience: 4-7 years
#         Role: Head - Engineering
#         Industry Type: IT Services & Consulting
#         Department: Engineering - Software & QA
#         Employment Type: Full Time, Permanent
#         Role Category: Software Development
#     '''

#     print("Running ATSDataModifier...")
#     modifier = ATSDataModifier()
#     modified_data = await modifier.generate_data(
#         job_description=job_description,
#         user_old_data=user_old_data
#     )

#     print("\n=== Modified Resume Data ===")
#     if hasattr(modified_data, 'model_dump_json'):
#         modified_json = modified_data.model_dump_json(indent=2)
#     else:
#         modified_json = json.dumps(modified_data, indent=2)

#     from pdf_generator import PDFGenerator
#     gen = PDFGenerator()
#     await gen.generate_pdfs_for_all_templates(data=modified_data.model_dump(), filename='bilal_resume_data_ai_modified_3')

# if __name__ == "__main__":
#     asyncio.run(main())


