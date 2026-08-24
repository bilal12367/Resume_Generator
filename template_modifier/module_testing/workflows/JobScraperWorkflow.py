

## This module is for testing a workflow for job scraper instead of giving complete control to agent.abs

import uuid
from pydantic import BaseModel
from dev_containers.connect import CentrifugoClient
from sqlalchemy import func
from llm_enhancement.observer import Observer
from llm_enhancement.mcp_agent import MCPAgent
from llm_enhancement.config import AgentConfig

from llama_index.core.workflow import Workflow, step, Event, StartEvent, StopEvent
from llm_enhancement.llm import LLM, LLMConfig
import asyncio

class JobScraperWorkflow(Workflow):

    @step()
    async def start_scraping_jobs(self, evt: StartEvent) -> StopEvent:
        # keywords = evt.get("keywords")
        # locations = evt.get("locations")
        # experience_level = evt.get("experience_level")
        # freshness = evt.get("freshness")
        user_input = evt.user_input
        cfg = LLMConfig()
        run_id = str(uuid.uuid4())
        cfg = (cfg.with_run_id(run_id).with_db('sqlite:///job_scraper_workflow.db')).build()

        self.cf = CentrifugoClient()

        SYSTEM_PROMPT = '''
        You are Job Finder agent, you will call the tools to search jobs according to keywords.
        1. Use keywords to find, location, experience and freshness (last 5 days etc.)
        2. Once you use tool to search jobs, you will get list of job ids, location and the company name.
        3. Only select top MNC global it companies or top product companies
        Eg. Infosys, Accenture, Deloitte, Capgemini, Tech Mahindra etc.
        4. Select few jobs like mostly 7-8 which suits more to what user asked and return the job ids.
        '''

        def broadcast_cf(run_id, data):
            print(type(data))
            self.cf.publish(channel=run_id, data=data)


        llm = LLM(llm_config=cfg, broadcaster=broadcast_cf)

        class User(BaseModel):
            name: str
            job: str
            experience_lvl: str
        print(user_input)
        resp = llm.run_with_schema(User, prompt="Collect the details of the user" + user_input)
        
        print("\\n\\n\\n", resp.model_dump_json())
        
        return StopEvent(
            name="stop",
            message="Done",
            data=None,
        )


async def main():
  wf = JobScraperWorkflow()

  # Run the workflow inside the active event loop context
  print("Starting")
  result = await wf.run(
      user_input=(
          "Hi, My names bilal and job is Data Scientist and experience is 2"
          " years"
      )
  )
  


if __name__ == "__main__":
  asyncio.run(main())

