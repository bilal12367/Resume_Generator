



import os
import sys
import json
import sqlite3
import atexit
import urllib.parse
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

# Add parent directory to path so we can import dev_containers
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dev_containers.connect import CentrifugoClient

DB_PATH = os.path.join(os.path.dirname(__file__), "session_jobs.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS job_condensed_descriptions (
            job_id TEXT PRIMARY KEY,
            condensed_output TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS job_descriptions (
            job_id TEXT PRIMARY KEY,
            session_id TEXT,
            title TEXT,
            company_name TEXT,
            location TEXT,
            minimal_description TEXT,
            raw_description TEXT,
            skills_required TEXT,
            job_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS generated_ats_resumes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            job_id TEXT,
            generated_json TEXT,
            output_pdf_folder TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def get_cached_job_description(job_id: str) -> str | None:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT condensed_output FROM job_condensed_descriptions WHERE job_id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return row[0]
    return None

def cache_job_description(job_id: str, condensed_output: str):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO job_condensed_descriptions (job_id, condensed_output)
        VALUES (?, ?)
    """, (job_id, condensed_output))
    conn.commit()
    conn.close()

def save_job_description(session_id: str, job_data: dict):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    job_id = job_data.get("job_id", "")
    skills_json = json.dumps(job_data.get("skills_required", []))
    cursor.execute("""
        INSERT OR REPLACE INTO job_descriptions
        (job_id, session_id, title, company_name, location, minimal_description, raw_description, skills_required, job_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        job_id,
        session_id or "",
        job_data.get("title", ""),
        job_data.get("company_name", ""),
        job_data.get("location", ""),
        job_data.get("minimal_description", ""),
        job_data.get("raw_description", ""),
        skills_json,
        job_data.get("job_url", "")
    ))
    conn.commit()
    conn.close()

def get_job_description(job_id: str) -> dict | None:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT job_id, session_id, title, company_name, location, minimal_description, raw_description, skills_required, job_url
        FROM job_descriptions WHERE job_id = ?
    """, (job_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        skills = []
        try:
            skills = json.loads(row[7]) if row[7] else []
        except Exception:
            pass
        return {
            "job_id": row[0],
            "session_id": row[1],
            "title": row[2],
            "company_name": row[3],
            "location": row[4],
            "minimal_description": row[5],
            "raw_description": row[6],
            "skills_required": skills,
            "job_url": row[8]
        }
    return None

def save_generated_ats_resume(session_id: str, job_id: str, generated_json_str: str, pdf_folder: str = ""):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO generated_ats_resumes (session_id, job_id, generated_json, output_pdf_folder)
        VALUES (?, ?, ?, ?)
    """, (session_id or "", job_id, generated_json_str, pdf_folder))
    conn.commit()
    conn.close()

def get_generated_ats_resumes(session_id: str = "", job_id: str = "") -> list[dict]:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    if session_id and job_id:
        cursor.execute("SELECT id, session_id, job_id, generated_json, output_pdf_folder, created_at FROM generated_ats_resumes WHERE session_id = ? AND job_id = ?", (session_id, job_id))
    elif session_id:
        cursor.execute("SELECT id, session_id, job_id, generated_json, output_pdf_folder, created_at FROM generated_ats_resumes WHERE session_id = ?", (session_id,))
    elif job_id:
        cursor.execute("SELECT id, session_id, job_id, generated_json, output_pdf_folder, created_at FROM generated_ats_resumes WHERE job_id = ?", (job_id,))
    else:
        cursor.execute("SELECT id, session_id, job_id, generated_json, output_pdf_folder, created_at FROM generated_ats_resumes ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    resumes = []
    for r in rows:
        gen_json = {}
        try:
            gen_json = json.loads(r[3])
        except Exception:
            pass
        resumes.append({
            "id": r[0],
            "session_id": r[1],
            "job_id": r[2],
            "generated_json": gen_json,
            "generated_json_file": f"generated_ats_{r[2]}.json",
            "generated_data": gen_json,
            "output_pdf_folder": r[4],
            "created_at": r[5]
        })
    return resumes

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
        jobs = []
        for card in cards:
            subtitle_el = card.find("h4", class_=lambda c: c and "base-search-card__subtitle" in c)
            company_link = subtitle_el.find("a") if subtitle_el else None
            loc_el = card.find("span", class_=lambda c: c and "job-search-card__location" in c)

            urn = card.get("data-entity-urn", "")
            job_id = urn.split(":")[-1] if urn and ":" in urn else urn

            company_name = company_link.text.strip() if company_link else (subtitle_el.text.strip() if subtitle_el else "")
            location = loc_el.text.strip() if loc_el else ""

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
        keywords: list[str],
        locations: list[str],
        experience_level: str,
        posted_within: int | str | None = None
    ) -> list[dict]:
        kw_str = " ".join(keywords) if isinstance(keywords, list) else str(keywords)
        loc_str = locations[0] if isinstance(locations, list) and len(locations) > 0 else (locations if isinstance(locations, str) else "")

        params = {"keywords": kw_str}
        if loc_str:
            params["location"] = loc_str

        tpr_val = self._format_time_posted_param(posted_within)
        if tpr_val:
            params["f_TPR"] = tpr_val

        url = f"https://www.linkedin.com/jobs/search/?{urllib.parse.urlencode(params)}"

        driver = await self.get_driver()
        await driver.goto(url)
        await driver.wait_for_load_state("domcontentloaded")
        
        html_content = await driver.content()
        return self.parse_job_cards(html_content)

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
    keywords: str,
    locations: str,
    experience_level: str = "",
    posted_within: str = None
) -> str:
    """
    Search for jobs on LinkedIn matching specified keywords, locations, and time filters.
    Returns jobs grouped by company name and location with job IDs.
    
    Args:
        keywords: String List of search keywords/titles separated by commas (e.g. Python, AI Engineer).
        locations: String List of locations separated by commas (e.g. Remote,San Francisco).
        experience_level: Seniority level (e.g. Entry Level, Mid Senior).
        posted_within: Time limit (e.g. '24h', '1d', '3d', '7d').
    """
    try:
        keywords = keywords.split(',')
        jobs = await linkedin.search_jobs(
            keywords=keywords,
            locations=locations,
            experience_level=experience_level,
            posted_within=posted_within
        )
        return format_jobs_grouped_by_company(jobs)
    except Exception as e:
        return f"Error searching jobs: {str(e)}"

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

