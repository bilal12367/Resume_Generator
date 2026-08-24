



import os
import sys
import json
import uuid
import atexit
import urllib.parse
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from sqlalchemy import create_engine, Column, String, Text, Integer, DateTime, func, select, or_
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Add parent directory to path so we can import dev_containers
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dev_containers.connect import CentrifugoClient

DB_PATH = os.path.join(os.path.dirname(__file__), "session_jobs.db")
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class SearchCursorCache(Base):
    __tablename__ = "search_cursor_caches"

    cursor_id = Column(String, primary_key=True)
    keywords = Column(Text, nullable=True)
    locations = Column(Text, nullable=True)
    experience_level = Column(String, nullable=True)
    posted_within = Column(String, nullable=True)
    current_offset = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "cursor_id": self.cursor_id,
            "keywords": self.keywords or "",
            "locations": self.locations or "",
            "experience_level": self.experience_level or "",
            "posted_within": self.posted_within or "",
            "current_offset": self.current_offset or 0,
            "created_at": str(self.created_at) if self.created_at else ""
        }

class JobCondensedDescription(Base):
    __tablename__ = "job_condensed_descriptions"

    job_id = Column(String, primary_key=True)
    condensed_output = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class JobDescription(Base):
    __tablename__ = "job_descriptions"

    job_id = Column(String, primary_key=True)
    session_id = Column(String, nullable=True)
    title = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    minimal_description = Column(Text, nullable=True)
    raw_description = Column(Text, nullable=True)
    skills_required = Column(Text, nullable=True)
    job_url = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        skills = []
        skills_str = str(self.skills_required) if self.skills_required else ""
        if skills_str:
            try:
                skills = json.loads(skills_str)
            except Exception:
                pass
        return {
            "job_id": self.job_id,
            "session_id": self.session_id or "",
            "title": self.title or "",
            "company_name": self.company_name or "",
            "location": self.location or "",
            "minimal_description": self.minimal_description or "",
            "raw_description": self.raw_description or "",
            "skills_required": skills,
            "job_url": self.job_url or ""
        }

class GeneratedATSResume(Base):
    __tablename__ = "generated_ats_resumes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, nullable=True)
    job_id = Column(String, nullable=True)
    generated_json = Column(Text, nullable=True)
    output_pdf_folder = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        gen_json = {}
        gen_json_str = str(self.generated_json) if self.generated_json else ""
        if gen_json_str:
            try:
                gen_json = json.loads(gen_json_str)
            except Exception:
                pass
        return {
            "id": self.id,
            "session_id": self.session_id or "",
            "job_id": self.job_id or "",
            "generated_json": gen_json,
            "generated_json_file": f"generated_ats_{self.job_id}.json",
            "generated_data": gen_json,
            "output_pdf_folder": self.output_pdf_folder or "",
            "created_at": str(self.created_at) if self.created_at else ""
        }

def init_db():
    Base.metadata.create_all(bind=engine)

def get_search_cursor(cursor_id: str) -> dict | None:
    init_db()
    with SessionLocal() as session:
        obj = session.get(SearchCursorCache, cursor_id)
        if obj:
            return obj.to_dict()
        return None

def save_search_cursor(cursor_id: str, keywords: str, locations: str, experience_level: str, posted_within: str, next_offset: int):
    init_db()
    with SessionLocal() as session:
        entity = SearchCursorCache(
            cursor_id=cursor_id,
            keywords=keywords or "",
            locations=locations or "",
            experience_level=experience_level or "",
            posted_within=posted_within or "",
            current_offset=next_offset
        )
        session.merge(entity)
        session.commit()

def get_cached_job_description(job_id: str) -> str | None:
    init_db()
    with SessionLocal() as session:
        obj = session.get(JobCondensedDescription, job_id)
        if obj and obj.condensed_output:
            return str(obj.condensed_output)
        return None

def cache_job_description(job_id: str, condensed_output: str):
    init_db()
    with SessionLocal() as session:
        session.merge(JobCondensedDescription(job_id=job_id, condensed_output=condensed_output))
        session.commit()

def save_job_description(session_id: str, job_data: dict):
    init_db()
    job_id = job_data.get("job_id", "")
    skills_json = json.dumps(job_data.get("skills_required", []))
    with SessionLocal() as session:
        entity = JobDescription(
            job_id=job_id,
            session_id=session_id or "",
            title=job_data.get("title", ""),
            company_name=job_data.get("company_name", ""),
            location=job_data.get("location", ""),
            minimal_description=job_data.get("minimal_description", ""),
            raw_description=job_data.get("raw_description", ""),
            skills_required=skills_json,
            job_url=job_data.get("job_url", "")
        )
        session.merge(entity)
        session.commit()

def get_job_description(job_id: str) -> dict | None:
    init_db()
    with SessionLocal() as session:
        entity = session.get(JobDescription, job_id)
        if entity:
            return entity.to_dict()
        return None

def save_generated_ats_resume(session_id: str, job_id: str, generated_json_str: str, pdf_folder: str = ""):
    init_db()
    with SessionLocal() as session:
        entity = GeneratedATSResume(
            session_id=session_id or "",
            job_id=job_id,
            generated_json=generated_json_str,
            output_pdf_folder=pdf_folder
        )
        session.add(entity)
        session.commit()

def get_generated_ats_resumes(session_id: str = "", job_id: str = "") -> list[dict]:
    init_db()
    with SessionLocal() as session:
        stmt = select(GeneratedATSResume)
        if session_id and job_id:
            stmt = stmt.where(GeneratedATSResume.session_id == session_id, GeneratedATSResume.job_id == job_id)
        elif session_id:
            stmt = stmt.where(GeneratedATSResume.session_id == session_id)
        elif job_id:
            stmt = stmt.where(GeneratedATSResume.job_id == job_id)
        else:
            stmt = stmt.order_by(GeneratedATSResume.created_at.desc())
        
        results = session.scalars(stmt).all()
        return [r.to_dict() for r in results]

class LinkedinPlatform:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.driver = None
    
    async def get_driver(self):
        if self.driver is None:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
            context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            self.driver = await context.new_page()
        return self.driver

    def parse_job_cards(self, html_content: str) -> list[dict]:
        soup = BeautifulSoup(html_content, "html.parser")
        list_container = soup.find(class_=lambda c: c and "jobs-search__results-list" in c)
        if not list_container:
            list_container = soup

        cards = list_container.find_all("div", class_=lambda c: c and "job-search-card" in c)
        if not cards:
            cards = list_container.find_all("li")

        jobs = []
        for card in cards:
            subtitle_el = card.find("h4", class_=lambda c: c and "base-search-card__subtitle" in c)
            company_link = subtitle_el.find("a") if subtitle_el else None
            loc_el = card.find("span", class_=lambda c: c and "job-search-card__location" in c)

            urn = card.get("data-entity-urn", "")
            if not urn:
                inner_div = card.find("div", attrs={"data-entity-urn": True})
                if inner_div:
                    urn = inner_div.get("data-entity-urn", "")

            job_id = urn.split(":")[-1] if urn and ":" in urn else urn

            company_name = company_link.text.strip() if company_link else (subtitle_el.text.strip() if subtitle_el else "")
            location = loc_el.text.strip() if loc_el else ""

            if job_id:
                job_data = {
                    "job_id": job_id,
                    "company_name": company_name,
                    "location": location
                }
                jobs.append(job_data)
        return jobs

    @staticmethod
    def _format_time_posted_param(posted_within: int | str | None) -> str | None:
        if not posted_within:
            return None
        
        if isinstance(posted_within, (int, float)):
            return f"r{int(posted_within)}"
        
        val_str = str(posted_within).strip().lower()
        if val_str.startswith("r"):
            return val_str
        
        if val_str.endswith("d") and val_str[:-1].isdigit():
            days = int(val_str[:-1])
            return f"r{days * 86400}"
        
        if val_str.endswith("h") and val_str[:-1].isdigit():
            hours = int(val_str[:-1])
            return f"r{hours * 3600}"
        
        if val_str.isdigit():
            return f"r{val_str}"
            
        return None

    async def search_jobs(
        self,
        keywords: list[str] | str,
        locations: list[str] | str,
        experience_level: str = "",
        posted_within: int | str | None = None,
        offset: int = 0,
        limit: int = 10
    ) -> list[dict]:
        kw_str = " ".join(keywords) if isinstance(keywords, list) else str(keywords)
        loc_str = locations[0] if isinstance(locations, list) and len(locations) > 0 else (locations if isinstance(locations, str) else "")

        params = {"keywords": kw_str}
        if loc_str:
            params["location"] = loc_str

        tpr_val = self._format_time_posted_param(posted_within)
        if tpr_val:
            params["f_TPR"] = tpr_val

        params["start"] = str(offset)

        if offset >= 25:
            url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?{urllib.parse.urlencode(params)}"
        else:
            url = f"https://www.linkedin.com/jobs/search/?{urllib.parse.urlencode(params)}"

        driver = await self.get_driver()
        await driver.goto(url)
        await driver.wait_for_load_state("domcontentloaded")
        
        html_content = await driver.content()
        all_jobs = self.parse_job_cards(html_content)

        if offset < 25:
            sliced_jobs = all_jobs[offset : offset + limit]
        else:
            sliced_jobs = all_jobs[:limit]

        return sliced_jobs

    def extract_minimal_desc_and_skills(self, full_description: str) -> tuple[str, list[str]]:
        if not full_description:
            return "", []

        lines = [line.strip() for line in full_description.split("\n") if line.strip()]

        boilerplate_terms = [
            "equal opportunity", "affirmative action", "race, color, religion",
            "gender identity", "sexual orientation", "protected veteran",
            "disability status", "work authorization", "e-verify", "privacy policy",
            "accommodations for applicants"
        ]

        cleaned_lines = []
        for line in lines:
            line_lower = line.lower()
            if not any(term in line_lower for term in boilerplate_terms):
                cleaned_lines.append(line)

        skills = []
        skill_section_keywords = [
            "skill", "requirement", "qualification", "tech stack", "technology",
            "what you need", "what you'll bring", "what we're looking for", "proficient", "experience with"
        ]

        in_skills = False
        for line in cleaned_lines:
            line_lower = line.lower()
            if any(kw in line_lower for kw in skill_section_keywords) and len(line) < 60:
                in_skills = True
                continue

            if in_skills:
                if line_lower.startswith(("about", "benefits", "perks", "compensation", "salary", "location", "how to apply")) and len(line) < 60:
                    in_skills = False
                    continue

                if line.startswith(("•", "-", "*", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.")):
                    item = line.lstrip("•-* 123456789.").strip()
                    if item and len(item) < 150:
                        skills.append(item)

        minimal_text = "\n".join(cleaned_lines[:20])
        if len(cleaned_lines) > 20:
            minimal_text += "\n..."

        unique_skills = []
        for s in skills:
            if s not in unique_skills:
                unique_skills.append(s)

        return minimal_text, unique_skills

    def parse_job_metadata(self, html_content: str, job_id: str = "") -> dict:
        soup = BeautifulSoup(html_content, "html.parser")
        details_pane = soup.find("div", class_=lambda c: c and "details-pane__content" in c)
        container = details_pane if details_pane else soup

        # Title
        title_el = (
            container.find("h2", class_=lambda c: c and "top-card-layout__title" in c)
            or container.find("h1", class_=lambda c: c and "top-card-layout__title" in c)
            or container.find("h1", class_=lambda c: c and "topcard__title" in c)
            or container.find("h2", class_=lambda c: c and "topcard__title" in c)
        )
        title = title_el.get_text(strip=True) if title_el else ""

        # Company
        company_el = (
            container.find("a", class_=lambda c: c and "topcard__org-name-link" in c)
            or container.find("span", class_=lambda c: c and "top-card-layout__first-sub-heading" in c)
            or container.find("a", class_=lambda c: c and "top-card-layout__first-sub-heading" in c)
        )
        company_name = company_el.get_text(strip=True) if company_el else ""

        # Location
        loc_el = (
            container.find("span", class_=lambda c: c and "topcard__flavor--bullet" in c)
            or container.find("span", class_=lambda c: c and "top-card-layout__second-sub-heading" in c)
        )
        location = loc_el.get_text(strip=True) if loc_el else ""

        # Posted time
        posted_el = (
            container.find("span", class_=lambda c: c and "posted-time-ago" in c)
            or container.find("span", class_=lambda c: c and "topcard__flavor--metadata" in c)
        )
        posted_time = posted_el.get_text(strip=True) if posted_el else ""

        # Number of applicants
        applicants_el = container.find("span", class_=lambda c: c and "num-applicants" in c)
        num_applicants = applicants_el.get_text(strip=True) if applicants_el else ""

        # Job Criteria (Seniority level, Employment type, Job function, Industries)
        criteria_items = container.find_all("li", class_=lambda c: c and "description__job-criteria-item" in c)
        criteria = {}
        for item in criteria_items:
            subheader = item.find("h3", class_=lambda c: c and "description__job-criteria-subheader" in c)
            text_el = item.find("span", class_=lambda c: c and "description__job-criteria-text" in c)
            if subheader and text_el:
                key = subheader.get_text(strip=True).lower().replace(" ", "_")
                criteria[key] = text_el.get_text(strip=True)

        # Extract skills (without including the description)
        desc_container = (
            container.find("div", class_=lambda c: c and "show-more-less-html__markup" in c)
            or container.find("div", class_=lambda c: c and "description__text" in c)
            or container.find("section", class_=lambda c: c and "description" in c)
            or container.find("div", class_=lambda c: c and "jobs-description" in c)
        )
        raw_description = desc_container.get_text(separator="\n", strip=True) if desc_container else ""
        _, skills_required = self.extract_minimal_desc_and_skills(raw_description)

        return {
            "job_id": job_id,
            "title": title,
            "company_name": company_name,
            "location": location,
            "posted_time": posted_time,
            "num_applicants": num_applicants,
            "seniority_level": criteria.get("seniority_level", ""),
            "employment_type": criteria.get("employment_type", ""),
            "job_function": criteria.get("job_function", ""),
            "industries": criteria.get("industries", ""),
            "skills_required": skills_required,
            "job_url": f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}" if job_id else ""
        }

    async def fetch_job_metadata(self, job_id: str) -> dict:
        url = f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}"
        driver = await self.get_driver()
        await driver.goto(url)
        await driver.wait_for_load_state("domcontentloaded")
        await driver.wait_for_timeout(4000)

        html_content = await driver.content()
        return self.parse_job_metadata(html_content, job_id)

    def parse_job_description(self, html_content: str, job_id: str = "") -> dict:
        soup = BeautifulSoup(html_content, "html.parser")
        details_pane = soup.find("div", class_=lambda c: c and "details-pane__content" in c)
        container = details_pane if details_pane else soup

        # Title
        title_el = (
            container.find("h2", class_=lambda c: c and "top-card-layout__title" in c)
            or container.find("h1", class_=lambda c: c and "top-card-layout__title" in c)
            or container.find("h1", class_=lambda c: c and "topcard__title" in c)
            or container.find("h2", class_=lambda c: c and "topcard__title" in c)
        )
        title = title_el.get_text(strip=True) if title_el else ""

        # Company
        company_el = (
            container.find("a", class_=lambda c: c and "topcard__org-name-link" in c)
            or container.find("span", class_=lambda c: c and "top-card-layout__first-sub-heading" in c)
            or container.find("a", class_=lambda c: c and "top-card-layout__first-sub-heading" in c)
        )
        company_name = company_el.get_text(strip=True) if company_el else ""

        # Location
        loc_el = (
            container.find("span", class_=lambda c: c and "topcard__flavor--bullet" in c)
            or container.find("span", class_=lambda c: c and "top-card-layout__second-sub-heading" in c)
        )
        location = loc_el.get_text(strip=True) if loc_el else ""

        # Description text
        desc_container = (
            container.find("div", class_=lambda c: c and "show-more-less-html__markup" in c)
            or container.find("div", class_=lambda c: c and "description__text" in c)
            or container.find("section", class_=lambda c: c and "description" in c)
            or container.find("div", class_=lambda c: c and "jobs-description" in c)
        )
        raw_description = desc_container.get_text(separator="\n", strip=True) if desc_container else ""

        minimal_desc, skills_required = self.extract_minimal_desc_and_skills(raw_description)

        return {
            "job_id": job_id,
            "title": title,
            "company_name": company_name,
            "location": location,
            "minimal_description": minimal_desc,
            "raw_description": raw_description,
            "skills_required": skills_required,
            "job_url": f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}" if job_id else ""
        }

    async def fetch_job_description(self, job_id: str) -> dict:
        url = f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}"
        driver = await self.get_driver()
        await driver.goto(url)
        await driver.wait_for_load_state("domcontentloaded")
        await driver.wait_for_timeout(4000)

        html_content = await driver.content()
        return self.parse_job_description(html_content, job_id)
    
    def apply_job(self, job_id: str, data_id: str) -> str:
        return f"Application process initiated for job {job_id} using resume profile '{data_id}'. Please visit https://www.linkedin.com/jobs/view/{job_id}/ to complete application steps."
    
    async def summarize_job(self, job_id: str) -> str:
        cached = get_cached_job_description(job_id)
        if cached:
            return cached

        job_data = await self.fetch_job_description(job_id)
        desc = job_data.get("raw_description", "") or job_data.get("minimal_description", "")
        if not desc:
            return "No job description found to summarize."
        
        try:
            from llama_index.llms.siliconflow import SiliconFlow
            api_key = os.getenv('SILICONFLOW_API_KEY')
            base_url = os.getenv('SILICONFLOW_BASE_URL')
            model = os.getenv('SILICONFLOW_MODEL_ID')

            kwargs = {"max_tokens": 2000}
            if api_key:
                kwargs["api_key"] = api_key
            if base_url:
                if not base_url.endswith('/chat/completions'):
                    base_url = base_url.rstrip('/') + '/chat/completions'
                kwargs["base_url"] = base_url
            if model:
                kwargs["model"] = model

            llm = SiliconFlow(**kwargs)
            prompt = (
                "Analyze the following job description and extract "
                "the most critical key requirements, essential skills, and qualifications "
                "an ideal applicant must possess. "
                "Condense them into a concise, bulleted list for quick review.\n\n"
                f"{desc}"
            )
            response = llm.complete(prompt)
            result_text = str(response.text)
            cache_job_description(job_id, result_text)
            return result_text
        except Exception as e:
            return f"Failed to generate summary using AI: {e}\n\nRaw Description (truncated):\n{desc[:500]}..."

    async def close(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

# Instantiate FastMCP server
mcp = FastMCP(
    "LinkedIn Platform Server",
    host=os.getenv("LINKEDIN_MCP_HOST", "0.0.0.0"),
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False)
)

# Instantiate LinkedinPlatform globally to reuse browser/context
linkedin = LinkedinPlatform()

# Ensure Playwright browser is closed cleanly when Python exits
def cleanup():
    try:
        import asyncio
        asyncio.run(linkedin.close())
    except Exception:
        pass

atexit.register(cleanup)

def format_jobs_grouped_by_company(jobs: list[dict]) -> str:
    if not jobs:
        return "No jobs found matching the criteria."

    from collections import defaultdict
    company_map = defaultdict(lambda: defaultdict(list))
    for job in jobs:
        company = job.get("company_name", "Unknown Company") or "Unknown Company"
        location = job.get("location", "Unknown Location") or "Unknown Location"
        job_id = job.get("job_id", "")
        if job_id:
            company_map[company][location].append(str(job_id))

    lines = []
    for company, loc_map in company_map.items():
        lines.append(f"{company}")
        first_loc = True
        for loc, jids in loc_map.items():
            jids_str = ", ".join(jids)
            if first_loc:
                lines.append(f"- JOB IDS -  {jids_str} - {loc}")
                first_loc = False
            else:
                lines.append(f"  {jids_str} - {loc}")
        lines.append("")

    return "\n".join(lines).strip()

@mcp.tool()
async def search_linkedin_jobs(
    keywords: str = "",
    locations: str = "",
    experience_level: str = "",
    posted_within: str = None,
    offset: int = 0,
    cursor: str | None = None,
    limit: int = 10
) -> str:
    """
    Search for jobs on LinkedIn matching specified keywords, locations, and time filters with cursor-based pagination.
    
    Args:
        keywords: String List of search keywords/titles separated by commas (e.g. Python, AI Engineer).
        locations: String List of locations separated by commas (e.g. Remote,San Francisco).
        experience_level: Seniority level (e.g. Entry Level, Mid Senior).
        posted_within: Time limit (e.g. '24h', '1d', '3d', '7d').
        offset: Starting offset (default 0).
        cursor: Optional UUID cursor string to continue a previous paginated search.
        limit: Max number of records to return per page (default 10).
    """
    try:
        current_cursor = cursor.strip() if cursor and cursor.strip() else None

        if current_cursor:
            cursor_data = get_search_cursor(current_cursor)
            if not cursor_data:
                return json.dumps({"error": f"Cursor '{current_cursor}' not found or expired.", "jobs": []}, indent=2)

            keywords = cursor_data.get("keywords") or keywords
            locations = cursor_data.get("locations") or locations
            experience_level = cursor_data.get("experience_level") or experience_level
            posted_within = cursor_data.get("posted_within") or posted_within
            start_offset = cursor_data.get("current_offset", offset)
        else:
            current_cursor = str(uuid.uuid4())
            start_offset = offset

        kw_list = [k.strip() for k in keywords.split(',') if k.strip()] if isinstance(keywords, str) and keywords else keywords

        jobs = await linkedin.search_jobs(
            keywords=kw_list,
            locations=locations,
            experience_level=experience_level,
            posted_within=posted_within,
            offset=start_offset,
            limit=limit
        )

        next_offset = start_offset + len(jobs)
        save_search_cursor(
            cursor_id=current_cursor,
            keywords=keywords if isinstance(keywords, str) else ",".join(keywords),
            locations=locations if isinstance(locations, str) else ",".join(locations),
            experience_level=experience_level or "",
            posted_within=posted_within or "",
            next_offset=next_offset
        )

        formatted_summary = format_jobs_grouped_by_company(jobs)

        result_payload = {
            "cursor": current_cursor,
            "current_offset": start_offset,
            "next_offset": next_offset,
            "count": len(jobs),
            "summary": formatted_summary,
            "jobs": jobs
        }
        return json.dumps(result_payload, indent=2)
    except Exception as e:
        return json.dumps({"error": f"Error searching jobs: {str(e)}", "jobs": []}, indent=2)

@mcp.tool()
async def get_linkedin_job_details(job_ids: str) -> str:
    """
    Fetch metadata and criteria details (excluding job description) for up to 4 LinkedIn job IDs.
    
    Args:
        job_ids: Comma-separated list of unique LinkedIn job posting IDs (maximum 4).
    """
    try:
        ids_list = [jid.strip() for jid in job_ids.split(',') if jid.strip()][:4]
        results = []
        for jid in ids_list:
            if jid:
                details = await linkedin.fetch_job_metadata(jid)
                results.append(details)
        return json.dumps(results, indent=2)
    except Exception as e:
        return f"Error fetching job details: {str(e)}"

@mcp.tool()
async def process_jobs(job_ids: str, session_id: str = "") -> str:
    """
    Process a list of LinkedIn job IDs: fetches full metadata and raw job description for each,
    saves them along with session ID into the database, and sends events to the UI via Centrifuge.
    
    Args:
        job_ids: Comma-separated list of LinkedIn job posting IDs.
        session_id: Optional session identifier.
    """
    try:
        ids_list = [jid.strip() for jid in job_ids.split(',') if jid.strip()]
        if not ids_list:
            return json.dumps({"status": "error", "message": "No valid job IDs provided.", "jobs": []})

        jobs_data = []
        for jid in ids_list:
            existing = get_job_description(jid)
            if existing and (existing.get("raw_description") or existing.get("minimal_description")):
                if session_id:
                    save_job_description(session_id, existing)
                jobs_data.append(existing)
            else:
                details = await linkedin.fetch_job_description(jid)
                save_job_description(session_id, details)
                jobs_data.append(details)

        # Publish to Centrifuge for the UI to pick up
        centrifugo = CentrifugoClient()
        centrifugo.publish("workflow", {
            "type": "human_input",
            "event": "process_jobs",
            "session_id": session_id,
            "jobs": jobs_data
        })
        centrifugo.publish("workflow", {
            "event_type": "job_descriptions_saved",
            "session_id": session_id,
            "jobs": jobs_data
        })

        return json.dumps({
            "status": "ok",
            "message": f"Successfully processed and saved {len(jobs_data)} job descriptions for session '{session_id}'.",
            "jobs": jobs_data
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Error processing jobs: {str(e)}", "jobs": []})

@mcp.tool()
async def apply_to_linkedin_job(job_id: str, data_id: str) -> str:
    """
    Initiate application flow for a LinkedIn job ID using the specified candidate profile.
    
    Args:
        job_id: Unique LinkedIn job posting ID.
        data_id: Candidate profile or resume identifier.
    """
    try:
        result = linkedin.apply_job(job_id, data_id)
        return result
    except Exception as e:
        return f"Error applying to job: {str(e)}"

if __name__ == '__main__':
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv()

    port = int(os.getenv("LINKEDIN_MCP_PORT", 8000))
    host = os.getenv("LINKEDIN_MCP_HOST", "0.0.0.0")
    print(f"Starting LinkedIn MCP Server on http://{host}:{port}/sse")
    app = mcp.sse_app()
    uvicorn.run(app, host=host, port=port)

