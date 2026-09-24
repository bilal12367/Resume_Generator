import asyncio
import json
import os
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from urllib.parse import urlencode, quote
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from sqlalchemy import create_engine, Column, String, Float, Text, JSON, DateTime, event
from sqlalchemy.orm import declarative_base, sessionmaker

# DB Model Definition
Base = declarative_base()


class JobPosting(Base):
    __tablename__ = "job_postings"

    job_id = Column(String, primary_key=True)
    keyword = Column(String, index=True)
    title = Column(String)
    url = Column(String)
    company = Column(String)
    rating = Column(Float, nullable=True)
    experience = Column(String, nullable=True)
    location = Column(String, nullable=True)
    short_description = Column(Text, nullable=True)
    full_description = Column(Text, nullable=True)
    tags = Column(JSON, nullable=True)
    posted_ago = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


def init_db(db_path: str):
    """Initializes database engine and tables with WAL mode for process safety."""
    engine = create_engine(f"sqlite:///{db_path}", echo=False, connect_args={"timeout": 30})
    
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    return engine


def build_naukri_url(keyword: str, location: str, experience: int, job_age: int = 15) -> str:
    """Builds formatted Naukri search URL."""
    formatted_keyword = keyword.strip().lower().replace(" ", "-")
    formatted_location = location.strip().lower().replace(" ", "-")
    base_path = f"https://www.naukri.com/{formatted_keyword}-jobs-in-{formatted_location}"
    params = {"experience": experience, "jobAge": job_age}
    query_string = urlencode(params, quote_via=quote)
    return f"{base_path}?{query_string}"


def parse_srp_jobs(html_content: str, keyword: str) -> list[dict]:
    """Parses Search Results Page (SRP) HTML into job card dicts."""
    soup = BeautifulSoup(html_content, "html.parser")
    job_wrappers = soup.find_all("div", class_="srp-jobtuple-wrapper")
    jobs_list = []

    for job in job_wrappers:
        job_id = job.get("data-job-id")
        if not job_id:
            continue

        title_tag = job.find("a", class_="title")
        title = title_tag.get_text(strip=True) if title_tag else None
        job_url = title_tag.get("href") if title_tag else None

        company_tag = job.find("a", class_="comp-name")
        company_name = company_tag.get_text(strip=True) if company_tag else None

        rating_tag = job.find("span", class_="main-2")
        rating_str = rating_tag.get_text(strip=True) if rating_tag else None
        rating = float(rating_str) if rating_str and rating_str.replace(".", "", 1).isdigit() else None

        exp_tag = job.find("span", class_="expwdth")
        experience = exp_tag.get("title").strip() if exp_tag and exp_tag.has_attr("title") else None

        loc_tag = job.find("span", class_="locWdth")
        location = loc_tag.get("title").strip() if loc_tag and loc_tag.has_attr("title") else None

        desc_tag = job.find("span", class_="job-desc")
        short_desc = desc_tag.get_text(strip=True) if desc_tag else None

        tags_list = []
        tags_container = job.find("ul", class_="tags-gt")
        if tags_container:
            tag_items = tags_container.find_all("li", class_="tag-li")
            tags_list = [t.get_text(strip=True) for t in tag_items]

        post_day_tag = job.find("span", class_="job-post-day")
        post_day = post_day_tag.get_text(strip=True) if post_day_tag else None

        jobs_list.append({
            "job_id": job_id,
            "keyword": keyword,
            "title": title,
            "url": job_url,
            "company": company_name,
            "rating": rating,
            "experience": experience,
            "location": location,
            "short_description": short_desc,
            "tags": tags_list,
            "posted_ago": post_day
        })

    return jobs_list


def parse_job_detail_description(html_content: str) -> str:
    """Parses single job page HTML for full job description."""
    soup = BeautifulSoup(html_content, "html.parser")

    # Method 1: Check JSON-LD schema
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "{}")
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                raw_desc = data.get("description", "")
                if raw_desc:
                    return BeautifulSoup(raw_desc, "html.parser").get_text(separator="\n", strip=True)
        except Exception:
            pass

    # Method 2: BeautifulSoup CSS Selectors
    jd_container = (
        soup.find("section", class_=lambda c: c and "job-desc-container" in c)
        or soup.find("div", class_=lambda c: c and "danger-html" in c)
        or soup.find("div", class_=lambda c: c and "JDC" in c)
    )
    if jd_container:
        return jd_container.get_text(separator="\n", strip=True)

    return ""


# Global top-level worker function for multiprocessing execution
def _worker_process_task(args_tuple):
    """Executes a single search request inside a dedicated process & asyncio event loop."""
    request_params, db_path, headless, max_detail_concurrency = args_tuple
    return asyncio.run(_async_process_request(request_params, db_path, headless, max_detail_concurrency))


async def _async_process_request(request_params: dict, db_path: str, headless: bool, max_detail_concurrency: int) -> dict:
    """Async engine pipeline for a single request inside a worker process."""
    keyword = request_params.get("keyword", "")
    location = request_params.get("location", "Hyderabad")
    experience = request_params.get("experience", 5)
    job_age = request_params.get("job_age", 15)

    engine = init_db(db_path)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    search_url = build_naukri_url(keyword=keyword, location=location, experience=experience, job_age=job_age)
    print(f"[PID {os.getpid()}] Starting search for keyword: '{keyword}' -> {search_url}")

    async with Stealth().use_async(async_playwright()) as p:
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-notifications",
                "--disable-desktop-notifications",
                "--no-default-browser-check"
            ]
        )

        try:
            # 1. Fetch Search Results Page HTML
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                permissions=[]
            )
            page = await context.new_page()
            await page.goto(search_url, wait_until="load", timeout=60000)
            await page.wait_for_load_state("load")
            await page.wait_for_timeout(6000)
            srp_html = await page.content()
            await context.close()

            # 2. Parse job cards
            jobs = parse_srp_jobs(srp_html, keyword)
            print(f"[PID {os.getpid()}] Extracted {len(jobs)} job cards for '{keyword}'")

            # 3. Cache Job Cards in Database
            session = SessionLocal()
            try:
                for j in jobs:
                    existing = session.query(JobPosting).filter_by(job_id=j["job_id"]).first()
                    if existing:
                        for k, v in j.items():
                            if v is not None:
                                setattr(existing, k, v)
                    else:
                        session.add(JobPosting(**j))
                session.commit()
            except Exception as e:
                session.rollback()
                print(f"[PID {os.getpid()}] DB error caching job cards: {e}")
            finally:
                session.close()

            # 4. Concurrently Fetch & Cache Full Job Descriptions
            updated_desc_count = 0
            if jobs:
                semaphore = asyncio.Semaphore(max_detail_concurrency)

                async def fetch_and_update_desc(job_entry):
                    nonlocal updated_desc_count
                    job_id = job_entry["job_id"]
                    job_url = job_entry.get("url")
                    if not job_url:
                        return

                    async with semaphore:
                        detail_ctx = await browser.new_context(
                            viewport={"width": 1280, "height": 800},
                            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                            permissions=[]
                        )
                        dpage = await detail_ctx.new_page()
                        try:
                            await dpage.goto(job_url, wait_until="load", timeout=60000)
                            await dpage.wait_for_load_state("load")
                            await dpage.wait_for_timeout(3000)
                            detail_html = await dpage.content()
                            full_desc = parse_job_detail_description(detail_html)

                            if full_desc:
                                db_sess = SessionLocal()
                                try:
                                    record = db_sess.query(JobPosting).filter_by(job_id=job_id).first()
                                    if record:
                                        record.full_description = full_desc
                                        db_sess.commit()
                                        updated_desc_count += 1
                                except Exception as dbe:
                                    db_sess.rollback()
                                    print(f"[PID {os.getpid()}] DB error updating description for {job_id}: {dbe}")
                                finally:
                                    db_sess.close()
                        except Exception as fe:
                            print(f"[PID {os.getpid()}] Error fetching detail page {job_url}: {fe}")
                        finally:
                            await detail_ctx.close()

                tasks = [fetch_and_update_desc(j) for j in jobs]
                await asyncio.gather(*tasks)

            print(f"[PID {os.getpid()}] Finished '{keyword}': {len(jobs)} jobs cached, {updated_desc_count} descriptions updated.")
            return {
                "keyword": keyword,
                "status": "success",
                "jobs_count": len(jobs),
                "descriptions_updated": updated_desc_count
            }

        finally:
            await browser.close()


class NaukriMultiProcessorScraper:
    """Multi-processing & Multi-threading Scraper Class for Naukri Job Listings & Descriptions."""

    def __init__(self, db_path: str = None, max_workers: int = None, max_detail_concurrency: int = 3, headless: bool = False):
        self.db_path = db_path or os.path.join(os.path.dirname(__file__), "test.db")
        self.max_workers = max_workers or min(4, multiprocessing.cpu_count())
        self.max_detail_concurrency = max_detail_concurrency
        self.headless = headless
        # Initialize DB tables
        init_db(self.db_path)

    def process_single_request(self, request_params: dict) -> dict:
        """Processes a single request in the current process."""
        return _worker_process_task((request_params, self.db_path, self.headless, self.max_detail_concurrency))

    def process_multiple_requests(self, requests_list: list[dict]) -> list[dict]:
        """Distributes multiple search requests across a Pool of processes running concurrently."""
        print(f"=== Distributing {len(requests_list)} requests across {self.max_workers} worker processes ===")
        
        tasks_tuples = [
            (req, self.db_path, self.headless, self.max_detail_concurrency)
            for req in requests_list
        ]

        with ProcessPoolExecutor(max_workers=self.max_workers) as executor:
            results = list(executor.map(_worker_process_task, tasks_tuples))

        print(f"=== Multi-Processing Batch Complete! Processed {len(results)} requests. ===")
        return results


if __name__ == "__main__":
    # Example incoming search requests
    incoming_requests = [
        {"keyword": "AI ML Engineer", "location": "Hyderabad", "experience": 5, "job_age": 15},
        {"keyword": "Python Developer", "location": "Bangalore", "experience": 3, "job_age": 10},
        {"keyword": "Data Scientist", "location": "Pune", "experience": 4, "job_age": 7},
    ]

    scraper = NaukriMultiProcessorScraper(
        db_path=os.path.join(os.path.dirname(__file__), "test.db"),
        max_workers=3,               # Process parallel worker count
        max_detail_concurrency=3,    # Playwright concurrent tabs per process
        headless=False
    )

    batch_results = scraper.process_multiple_requests(incoming_requests)
    print("Batch Results Summary:", json.dumps(batch_results, indent=2))
