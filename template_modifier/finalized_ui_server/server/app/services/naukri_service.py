import re
import json
import time
import logging
import asyncio
import urllib.parse
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional, Union

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

logger = logging.getLogger("NaukriService")

class NaukriService:
    def __init__(self):
        pass

    @staticmethod
    def build_search_url(
        keywords: Union[str, List[str]],
        location: Optional[str] = "",
        experience: Optional[Union[str, int]] = "",
        page_no: int = 1
    ) -> str:
        kw_str = " ".join(keywords) if isinstance(keywords, list) else (keywords or "").strip()
        loc_str = (location or "").strip()

        clean_kw = "-".join(kw_str.lower().split()) if kw_str else ""
        clean_loc = "-".join(loc_str.lower().split()) if loc_str else ""

        if clean_kw and clean_loc:
            slug = f"{clean_kw}-jobs-in-{clean_loc}"
        elif clean_kw:
            slug = f"{clean_kw}-jobs"
        elif clean_loc:
            slug = f"jobs-in-{clean_loc}"
        else:
            slug = "jobs"

        if page_no and page_no > 1:
            slug = f"{slug}-{page_no}"

        base_url = f"https://www.naukri.com/{slug}"

        query_params = {}
        if experience is not None and str(experience).strip() != "":
            query_params["experience"] = str(experience).strip()

        if query_params:
            return f"{base_url}?{urllib.parse.urlencode(query_params)}"
        return base_url

    @staticmethod
    def extract_job_id_from_url(job_url: str) -> str:
        if not job_url:
            return ""
        match = re.search(r'-(\d{8,16})(?:\?|$)', job_url)
        if match:
            return match.group(1)
        match_digits = re.search(r'(\d{8,16})', job_url.split('/')[-1])
        if match_digits:
            return match_digits.group(1)
        return str(abs(hash(job_url)))

    def create_selenium_driver(self) -> webdriver.Chrome:
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_argument(
            "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        driver = webdriver.Chrome(options=options)
        return driver

    def extract_jobs_from_html(self, html_content: str) -> List[Dict[str, Any]]:
        soup = BeautifulSoup(html_content, "html.parser")
        CARD_SELECTOR = "div.srp-jobtuple-wrapper, article.jobTuple, div.tuple"

        SCHEMA = {
            "title":      ("a.title, a.job-title", "text"),
            "url":        ("a.title, a.job-title", "href"),
            "company":    ("a.comp-name, span.comp-name, .subTitle", "text"),
            "rating":     ("span.rating, .rating", "text"),
            "experience": ("span.exp-wrap, span.expwdth, .experience", "text"),
            "salary":     ("span.sal-wrap, .salary", "text"),
            "location":   ("span.loc-wrap, span.locWdth, .location", "text"),
            "skills":     ("ul.tags-row li, div.tags-gt li, .dot-gt li", "list")
        }

        jobs = []
        for card in soup.select(CARD_SELECTOR):
            job_data: Dict[str, Any] = {}
            for field, (selector, extract_type) in SCHEMA.items():
                elem = card.select_one(selector)
                if extract_type == "list":
                    job_data[field] = [tag.get_text(strip=True) for tag in card.select(selector) if tag.get_text(strip=True)]
                elif extract_type == "href":
                    job_data[field] = elem.get("href") if elem else None
                else:
                    job_data[field] = elem.get_text(strip=True) if elem else None

            if job_data.get("title"):
                job_url = str(job_data.get("url") or "")
                if job_url and not job_url.startswith("http"):
                    job_url = f"https://www.naukri.com{job_url}"

                job_id = self.extract_job_id_from_url(job_url)

                jobs.append({
                    "job_id": job_id,
                    "title": job_data.get("title", ""),
                    "company_name": job_data.get("company", "") or "Employer",
                    "location": job_data.get("location", "") or "Not Specified",
                    "experience": job_data.get("experience", "") or "",
                    "posted_date": "",
                    "posted_time": "",
                    "job_url": job_url,
                    "job_source": "naukri"
                })

        return jobs

    def search_sync(
        self,
        keywords: Union[List[str], str],
        location: Optional[str] = "",
        experience: Optional[Union[str, int]] = "",
        page_no: int = 1,
        offset: int = 0,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        url = self.build_search_url(keywords=keywords, location=location, experience=experience, page_no=page_no)
        logger.info(f"[NaukriService] Navigating with Selenium Headless to: {url}")

        driver = None
        try:
            driver = self.create_selenium_driver()
            driver.get(url)
            wait = WebDriverWait(driver, 15)
            wait.until(
                EC.presence_of_element_located((
                    By.CSS_SELECTOR,
                    "div.srp-jobtuple-wrapper, article.jobTuple, div.tuple"
                ))
            )
            time.sleep(2)
            html_content = driver.page_source
            all_jobs = self.extract_jobs_from_html(html_content)
            logger.info(f"[NaukriService] Found {len(all_jobs)} jobs on page!")
            return all_jobs[offset : offset + limit] if offset > 0 else all_jobs[:limit]
        except Exception as e:
            logger.error(f"[NaukriService] Error scraping search URL '{url}': {e}")
            return []
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    async def search_jobs(
        self,
        keywords: Union[List[str], str],
        location: Optional[str] = "",
        experience: Optional[Union[str, int]] = "",
        page_no: int = 1,
        offset: int = 0,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(
            self.search_sync,
            keywords=keywords,
            location=location,
            experience=experience,
            page_no=page_no,
            offset=offset,
            limit=limit
        )

    def extract_minimal_desc_and_skills(self, full_description: str) -> tuple[str, List[str]]:
        if not full_description:
            return "", []

        lines = [line.strip() for line in full_description.split("\n") if line.strip()]
        boilerplate_terms = [
            "equal opportunity", "affirmative action", "disability status", "work authorization",
            "privacy policy", "accommodations for applicants", "all rights reserved"
        ]

        cleaned_lines = []
        for line in lines:
            line_lower = line.lower()
            if not any(term in line_lower for term in boilerplate_terms):
                cleaned_lines.append(line)

        skills = []
        skill_keywords = [
            "skill", "requirement", "qualification", "tech stack", "technology",
            "what you need", "what you'll bring", "what we're looking for", "proficient", "key skills"
        ]

        in_skills = False
        for line in cleaned_lines:
            line_lower = line.lower()
            if any(kw in line_lower for kw in skill_keywords) and len(line) < 60:
                in_skills = True
                continue

            if in_skills:
                if line_lower.startswith(("about", "benefits", "perks", "compensation", "salary", "location")) and len(line) < 60:
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

    def get_job_description_sync(self, job_id: str, job_url: str = "") -> Dict[str, Any]:
        url = job_url or f"https://www.naukri.com/job-listings-{job_id}"
        logger.info(f"[NaukriService] Fetching job description with Selenium: {url}")

        driver = None
        try:
            driver = self.create_selenium_driver()
            driver.get(url)
            time.sleep(3)
            html_content = driver.page_source
            soup = BeautifulSoup(html_content, "html.parser")

            desc_el = (
                soup.find(class_=re.compile(r"^styles_job-desc-container__[a-zA-Z0-9]"))
                or soup.select_one('div[class*="job-desc-container"], div[class*="styles_job-desc-container"], section.job-desc, div.job-desc')
                or soup.select_one('section.description, div.description')
            )
            raw_description = desc_el.get_text(separator="\n", strip=True) if desc_el else ""

            title_el = (
                soup.select_one('h1[class*="title"]')
                or soup.select_one('h1.jd-header-title')
                or soup.select_one('h1')
            )
            title = title_el.get_text(strip=True) if title_el else ""

            comp_el = (
                soup.select_one('div[class*="jd-header-comp-name"] a')
                or soup.select_one('a[class*="pad-rt-8"]')
                or soup.select_one('div[class*="comp-name"]')
            )
            company_name = comp_el.get_text(strip=True) if comp_el else ""

            exp_el = (
                soup.select_one('div[class*="exp"] span')
                or soup.select_one('span[class*="exp"]')
            )
            experience = exp_el.get_text(strip=True) if exp_el else ""

            loc_el = (
                soup.select_one('div[class*="loc"] span')
                or soup.select_one('span[class*="loc"]')
            )
            location = loc_el.get_text(strip=True) if loc_el else ""

            key_skills = []
            skill_elements = soup.select('div[class*="key-skill"] span, a[class*="chip"], div.key-skill a, div.key-skill span')
            for el in skill_elements:
                t = el.get_text(strip=True)
                if t and t not in key_skills and len(t) < 50:
                    key_skills.append(t)

            minimal_desc, extracted_skills = self.extract_minimal_desc_and_skills(raw_description)
            all_skills = list(dict.fromkeys(key_skills + extracted_skills))

            return {
                "job_id": job_id or self.extract_job_id_from_url(url),
                "title": title,
                "company_name": company_name,
                "location": location,
                "posted_time": "",
                "num_applicants": "",
                "seniority_level": experience,
                "employment_type": "",
                "job_function": "",
                "industries": "",
                "minimal_description": minimal_desc,
                "raw_description": raw_description,
                "skills_required": all_skills,
                "job_url": url,
                "job_source": "naukri"
            }
        except Exception as e:
            logger.error(f"[NaukriService] Error fetching job description for '{job_id}': {e}")
            return {
                "job_id": job_id,
                "title": f"Naukri Job {job_id}",
                "company_name": "Naukri Listing",
                "location": "",
                "posted_time": "",
                "minimal_description": "Description unavailable.",
                "raw_description": "Description unavailable.",
                "skills_required": [],
                "job_url": url,
                "job_source": "naukri"
            }
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    async def get_job_description(self, job_id: str, job_url: str = "") -> Dict[str, Any]:
        return await asyncio.to_thread(self.get_job_description_sync, job_id=job_id, job_url=job_url)

    async def close(self):
        pass

    async def process_single_job_and_save(self, job_id: str, job_url: str = "") -> Optional[Dict[str, Any]]:
        if not job_id:
            return None

        from app.llm.agent import AgentDatabase
        db = AgentDatabase()

        try:
            cached = db.get_cached_job_description(job_id, job_source="naukri")
            if cached:
                logger.info(f"[NaukriService] Job ID '{job_id}' (naukri) is already cached in DB.")
                return cached

            logger.info(f"[NaukriService] Live fetching & saving job details for Naukri Job ID '{job_id}'...")
            details = await self.get_job_description(job_id, job_url=job_url)
            details["job_source"] = "naukri"

            if details and details.get("job_id"):
                try:
                    db.save_job_description(details, job_source="naukri")
                    logger.info(f"[NaukriService] Successfully saved Naukri job description for '{job_id}' into DB.")
                except Exception as e:
                    logger.warning(f"[NaukriService] Failed to save job '{job_id}' to DB: {e}")
            return details
        except Exception as e:
            logger.error(f"[NaukriService] Error processing Naukri job '{job_id}': {e}")
            return None

    async def save_job_details_bulk(self, job_ids: List[str], max_concurrency: int = 5) -> None:
        if not job_ids:
            return

        unique_ids = list(dict.fromkeys(str(j) for j in job_ids if j))
        logger.info(f"[NaukriService] Kicking off bulk processing & DB saving for {len(unique_ids)} Naukri Job ID(s)...")

        semaphore = asyncio.Semaphore(max_concurrency)

        async def worker(jid: str):
            async with semaphore:
                service_instance = NaukriService()
                try:
                    await service_instance.process_single_job_and_save(jid)
                finally:
                    await service_instance.close()

        tasks = [worker(jid) for jid in unique_ids]
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"[NaukriService] Bulk processing completed for {len(unique_ids)} Naukri Job ID(s).")