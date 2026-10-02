

from app.llm.job_search_agent import search_linkedin_jobs
from app.llm.job_search_agent import JobSearchAgent
import asyncio, json
from app.services.linkedin_service import LinkedInService


async def main():
    svc = LinkedInService()
    # jobs = await svc.search_jobs("Full Stack Springboot React js Deloitte TCS", 'Hyderabad',"", "14d", 0 , 20)
    # jobs_js = json.dumps(jobs, indent=2)
    # search_linkedin_jobs({"keywords": "Full Stack React Spring Boot", "location": "Hyderabad", "offset": 0, "limit": 10, "posted_within": "15d"})
    # search_linkedin_jobs(keywords='Full Stack React Spring Boot', location='Hyderabad', posted_within='15d', limit=10)
    # print("Completely fetched job metadata")
    # job_desc = [await svc.get_job_description(job["job_id"]) for job in jobs]
    # job_desc = [await svc.get_job_description(job["job_id"]) for job in jobs_js]
    # print(json.dumps(jobs, indent=2))
    print(json.dumps(await svc.get_job_description("4424683202"), indent=4))


asyncio.run(main())

