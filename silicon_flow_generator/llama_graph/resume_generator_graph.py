from llama_index.core.workflow import (
    step, 
    StartEvent, 
    StopEvent, 
    Workflow,
    Context, 
    Event
)
import asyncio, sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pydantic import BaseModel
from database.connection import get_db
from service.prompt_svc import PromptService
from schema.resume_generator_schemas.user_data_schema import ResumeData


from logger.config import setup_logging

from deepseek.llm import SiliconFlowLLM

setup_logging()

import logging
logger = logging.getLogger('app.objects')



class StatusEvent(Event):
    error: bool
    message: str
    message_object: dict = None
    node_name: str

class WorkflowState(BaseModel):
    user_data: dict = None
    user_json_data: dict = None




class ResumeGeneratorWorkflow(Workflow):


    def send_status_event(self, error: bool, node_name: str, message: str, message_object: dict = None):
        self.ctx.write_event_to_stream(StatusEvent(error=error, node_name=node_name, message=message, message_object=message_object))

    @step
    async def segregator_node(self, ctx: Context[WorkflowState], ev: StartEvent) -> StopEvent:
        if not ev.user_data:
            self.send_status_event(error=True, node_name=self.segregator_node.__name__, message="User Data not provided!!")
        await ctx.store.set('user_data', ev.user_data)
        logging.info(f"SEGREGATOR_NODE: Stored user data in context: ")
        logging.info(f"Starting Segregation")
        llm = SiliconFlowLLM()

        prompt = PromptService(next(get_db())).get_by_name("EXTRACTION_PROMPT")
        user_json_data = llm.call(system_prompt=prompt.prompt, user_prompt=ev.user_data,max_tokens=5000, output_schema=ResumeData)
        await ctx.store.set('user_json_data', user_json_data.dict())
        return StopEvent(user_json_data=user_json_data)
    



async def main():
    wf = ResumeGeneratorWorkflow()
    # ctx = Context(wf)
    user_data = '''
Arjun Mehta, based out of Bangalore, India. You can ping me at arjun.mehta.dev@gmail.com or
call on +91-9845012376. Also active on LinkedIn at linkedin.com/in/arjunmehta-dev and my
personal portfolio is at arjunmehta.io. GitHub is github.com/arjunmehta-ai.

So a little about me — I've been in the software industry for around 8 years now, started
right after my B.Tech in Computer Science from PES University, Bangalore back in 2016, got
around 8.7 CGPA. Also did a certification in Deep Learning from Coursera (deeplearning.ai
specialization) sometime around 2019, and a couple years later got the AWS Solutions Architect
Associate badge in 2021. More recently wrapped up a MLOps Professional cert from Google Cloud
in late 2023.

I usually describe myself as an AI Full Stack Engineer — basically I work across the whole
stack but with a heavy focus on integrating machine learning, LLMs, and AI pipelines into
production-grade web applications. I've led teams, owned infrastructure, built stuff from
scratch, and also parachuted into legacy codebases to modernize them.

---

First job was at a startup called Nuclios AI in Bangalore. Joined them in July 2016 straight
out of college as a Junior Full Stack Developer. Small team, fast paced, learned a ton. We
were building a B2B analytics SaaS platform. I mostly worked on the frontend initially with
React and then slowly got pulled into the Python backend. Left in August 2018. In those two
years I built out a bunch of dashboard components, worked on REST APIs using Flask, helped
migrate their MySQL setup to PostgreSQL, and wrote some basic ETL pipelines using pandas.
The team used JIRA for tracking, deployed on AWS EC2, and I got comfortable with Git workflows
and basic CI/CD using Jenkins. Tech stack was pretty standard — React, Redux, Python, Flask,
PostgreSQL, AWS EC2, pandas, Jenkins.

---

Second company was Thoughtworks, the well known tech consultancy. Joined in September 2018 as
a Full Stack Developer. Much bigger company, much more structured. Worked there for about 3
years until October 2021. At Thoughtworks I worked across multiple client projects — one was
a logistics optimization platform for a European client, another was an internal ML model
deployment framework. I got really deep into ML pipelines here. Started using FastAPI heavily,
got into Docker and Kubernetes for containerization and orchestration, worked with Kafka for
event streaming on the logistics side. Also started seriously working with scikit-learn and
XGBoost for the ML parts, and integrated a recommendation engine into one of the client
platforms. Team was big, around 20-25 people across clients, and I led a sub-team of 4 devs
on the ML deployment framework project. Also got into Terraform for infrastructure as code
here. Core stack: FastAPI, React, TypeScript, Docker, Kubernetes, Kafka, scikit-learn,
XGBoost, PostgreSQL, Redis, Terraform, Azure.

---

Third and current company is Sarvam AI, a pretty well known Indian AI startup focused on
building language AI for Indian languages. Joined in November 2021 as a Senior AI Full Stack
Engineer. This is where things really went deep on the AI side. I work directly with LLMs,
fine-tuning, RAG pipelines, and building full product features on top of them. I'm also a
tech lead here managing a team of 6 engineers. We build production systems that serve millions
of users so scale and reliability is super important. I own the architecture for our developer
API platform and also contribute directly to model integration work.

Technologies here are pretty cutting edge — LangChain, LlamaIndex, OpenAI APIs, Hugging Face
Transformers, FastAPI, Next.js, PostgreSQL with pgvector for vector search, Pinecone as an
external vector DB, Redis for caching, Celery for async task queues, Docker, Kubernetes on
GCP, Terraform, and we monitor everything with Grafana and Prometheus. Heavy use of Python
obviously, TypeScript on the frontend. Salary is good, work is meaningful.

---

Now for projects — I've done quite a few but here are the main ones worth mentioning:

First one is called VaakBot, an AI-powered multilingual chatbot platform I built at Sarvam AI.
This was a full product — users could create custom chatbots trained on their own documents in
Indian languages like Hindi, Tamil, Telugu, and Kannada. Tech stack was FastAPI backend,
Next.js frontend, LangChain for the LLM orchestration, Pinecone for vector storage, OpenAI
GPT-4 and our own fine-tuned models for generation. The RAG pipeline ingested PDFs, URLs, and
plain text. Handled around 50k daily active users at peak. Key highlights — reduced hallucination
rate by 40% using a hybrid retrieval strategy, built a document chunking pipeline that improved
retrieval accuracy by 35%, and the whole thing was deployed on GCP with autoscaling. You can
check it at vaakbot.sarvam.ai.

Second project is an ML Model Deployment Framework I built at Thoughtworks, internally called
ModelDock. It was basically a lightweight MLOps platform that allowed data scientists to push
sklearn and XGBoost models via a CLI and have them automatically containerized, versioned, and
served behind a FastAPI endpoint with monitoring baked in. Used Docker for containerization,
MLflow for experiment tracking and model registry, Prometheus for metrics, and deployed on
Azure Kubernetes. This was huge internally — reduced model deployment time from 2 weeks to
under 2 hours. Team of 4 worked on it, I led the backend and infra side. No public URL,
internal tool.

Third is SkillLens, an AI resume analyzer and job matcher I built as a side project. It takes
a raw resume text, extracts structured data using GPT-4 with a Pydantic schema, then matches
it against job descriptions using semantic similarity via sentence-transformers and cosine
similarity. Frontend is Next.js, backend FastAPI, deployed on Railway. Used pgvector for
storing job embeddings. This one's live at skilllens.dev. Built solo over about 3 months.
Key thing — 87% accuracy on skill extraction benchmarked against 500 manually labeled resumes.

Fourth project is LogicFlow, a low-code AI workflow builder I'm currently building at Sarvam.
Think n8n but AI-native. Users can drag and drop LLM nodes, data transformation nodes, API
call nodes, and vector search nodes to build complex AI pipelines visually. Frontend is React
Flow based, backend is FastAPI with Celery for async execution, Redis as the message broker.
Still in beta at logicflow.sarvam.ai. This has been a huge technical challenge — the execution
engine handles DAG-based task graphs and supports parallel node execution.

Fifth is NutriScan, a computer vision project I built solo to learn more about vision models.
It's a mobile-friendly web app where you photograph your meal and it returns nutritional
information. Used YOLOv8 for food detection, a custom fine-tuned EfficientNet for food
classification trained on the Food-101 dataset, and a nutrition lookup via USDA API. Frontend
is plain React, backend FastAPI, deployed on Hugging Face Spaces. Not super production grade
but got some traction — around 3000 users. URL is huggingface.co/spaces/arjunmehta/nutriscan.

---

On the skills side — technical skills include Python, TypeScript, JavaScript, SQL. Frameworks
and libraries I work with regularly are FastAPI, React, Next.js, LangChain, LlamaIndex,
Hugging Face Transformers, scikit-learn, XGBoost, YOLOv8, sentence-transformers, pandas,
numpy, Celery. Databases I've worked with are PostgreSQL, MySQL, Redis, Pinecone, pgvector.
Infrastructure and DevOps side — Docker, Kubernetes, Terraform, GCP, AWS, Azure, Jenkins,
GitHub Actions, Prometheus, Grafana, MLflow, Kafka.

Soft skills — I'm generally good at technical leadership, have mentored junior devs, pretty
comfortable with system design discussions, agile workflows, and cross-functional collaboration
with product and data science teams.

Languages I speak — English is fluent, Hindi is native, Kannada is conversational.

Interests outside work — I write occasionally on Medium about LLMs and AI engineering, love
chess (rated around 1600 on Lichess), into distance running and did my first half marathon in
early 2024.

Awards — got an internal Thoughtworks spotlight award in 2020 for the ModelDock project.
Was also runner up at a national level hackathon called HackIndia 2022 with the early version
of VaakBot.

Volunteer — I mentor students on AI and full stack development through a nonprofit called
GrowWithAI. Been doing that since 2022, roughly twice a month sessions.
'''
    logging.info(f"Invoking workflow with user data: {user_data[:100]}...")  # Log the first 100 chars for brevity
    handler = wf.run(user_data=user_data)
    async for ev in handler.stream_events():
        if isinstance(ev, StatusEvent):
            logger.info(ev.model_dump())
    result = await handler
    print("Final Result:")
    print(str(result))

asyncio.run(main())