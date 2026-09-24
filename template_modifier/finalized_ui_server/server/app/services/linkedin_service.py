import re
import json
import logging
import asyncio
import urllib.parse
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional, Union
from playwright.async_api import async_playwright

logger = logging.getLogger("LinkedInService")

class LinkedInService:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.driver = None

    async def get_driver(self):
        if self.driver is None or self.driver.is_closed():
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(headless=True)
            context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            self.driver = await context.new_page()
        return self.driver

    @staticmethod
    def format_time_posted_param(posted_within: Union[int, str, None]) -> Optional[str]:
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

    def parse_job_cards(self, html_content: str) -> List[Dict[str, str]]:
        soup = BeautifulSoup(html_content, "html.parser")
        list_container = soup.find(class_=lambda c: c and "jobs-search__results-list" in c)
        if not list_container:
            list_container = soup

        cards = list_container.find_all("div", class_=lambda c: c and "job-search-card" in c)
        if not cards:
            cards = list_container.find_all("li")

        jobs = []
        for card in cards:
            title_el = card.find("h3", class_=lambda c: c and "base-search-card__title" in c)
            subtitle_el = card.find("h4", class_=lambda c: c and "base-search-card__subtitle" in c)
            company_link = subtitle_el.find("a") if subtitle_el else None
            loc_el = card.find("span", class_=lambda c: c and "job-search-card__location" in c)

            urn_attr = card.get("data-entity-urn", "")
            urn_str = str(urn_attr[0]) if isinstance(urn_attr, list) else (str(urn_attr) if urn_attr else "")
            if not urn_str:
                inner_div = card.find("div", attrs={"data-entity-urn": True})
                if inner_div:
                    inner_urn = inner_div.get("data-entity-urn", "")
                    urn_str = str(inner_urn[0]) if isinstance(inner_urn, list) else (str(inner_urn) if inner_urn else "")

            job_id = urn_str.split(":")[-1] if urn_str and ":" in urn_str else urn_str

            title = title_el.text.strip() if title_el else ""
            company_name = company_link.text.strip() if company_link else (subtitle_el.text.strip() if subtitle_el else "")
            location = loc_el.text.strip() if loc_el else ""

            if job_id:
                job_data = {
                    "job_id": job_id,
                    "title": title,
                    "company_name": company_name,
                    "location": location,
                    "job_url": f"https://www.linkedin.com/jobs/view/{job_id}/"
                }
                jobs.append(job_data)
        return jobs

    async def search_jobs(
        self,
        keywords: Union[List[str], str],
        locations: Union[List[str], str],
        experience_level: str = "",
        posted_within: Union[int, str, None] = None,
        offset: int = 0,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        kw_str = " ".join(keywords) if isinstance(keywords, list) else str(keywords)
        loc_str = locations[0] if isinstance(locations, list) and len(locations) > 0 else (locations if isinstance(locations, str) else "")

        params = {"keywords": kw_str}
        if loc_str:
            params["location"] = loc_str

        tpr_val = self.format_time_posted_param(posted_within)
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

    def extract_minimal_desc_and_skills(self, full_description: str) -> tuple[str, List[str]]:
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

    def parse_job_description(self, html_content: str, job_id: str = "") -> Dict[str, Any]:
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
        posted_time = ""
        tertiary_container = container.find("div", class_=lambda c: c and "job-details-jobs-unified-top-card__tertiary-description-container" in c)
        if tertiary_container:
            for span in tertiary_container.find_all("span"):
                txt = span.get_text(strip=True)
                if txt and (re.search(r'\b(\d+|a|an)\s*(day|hour|week|month|minute)s?\s*(ago|old)?\b', txt, re.I) or re.search(r'\byesterday\b', txt, re.I)):
                    posted_time = txt
                    break

        if not posted_time:
            posted_el = (
                container.find("span", class_=lambda c: c and "posted-time-ago" in c)
                or container.find("span", class_=lambda c: c and "topcard__flavor--metadata" in c)
            )
            posted_time = posted_el.get_text(strip=True) if posted_el else ""

        # Number of applicants
        applicants_el = container.find("span", class_=lambda c: c and "num-applicants" in c)
        num_applicants = applicants_el.get_text(strip=True) if applicants_el else ""

        # Job Criteria
        criteria_items = container.find_all("li", class_=lambda c: c and "description__job-criteria-item" in c)
        criteria = {}
        for item in criteria_items:
            subheader = item.find("h3", class_=lambda c: c and "description__job-criteria-subheader" in c)
            text_el = item.find("span", class_=lambda c: c and "description__job-criteria-text" in c)
            if subheader and text_el:
                key = subheader.get_text(strip=True).lower().replace(" ", "_")
                criteria[key] = text_el.get_text(strip=True)

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
            "posted_time": posted_time,
            "num_applicants": num_applicants,
            "seniority_level": criteria.get("seniority_level", ""),
            "employment_type": criteria.get("employment_type", ""),
            "job_function": criteria.get("job_function", ""),
            "industries": criteria.get("industries", ""),
            "minimal_description": minimal_desc,
            "raw_description": raw_description,
            "skills_required": skills_required,
            "job_url": f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}" if job_id else ""
        }

    async def get_job_description(self, job_id: str) -> Dict[str, Any]:
        url = f"https://www.linkedin.com/jobs/search/?currentJobId={job_id}"
        driver = await self.get_driver()
        await driver.goto(url)
        await driver.wait_for_load_state("domcontentloaded")
        await driver.wait_for_timeout(3000)

        html_content = await driver.content()
        return self.parse_job_description(html_content, job_id)

    async def close(self):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def process_single_job_and_save(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetches job details for a single job_id and saves it into DB if not already cached.
        """
        if not job_id:
            return None

        from app.llm.agent import AgentDatabase
        db = AgentDatabase()

        try:
            cached = db.get_cached_job_description(job_id)
            if cached:
                logger.info(f"[LinkedInService] Job ID '{job_id}' is already cached in DB.")
                return cached

            logger.info(f"[LinkedInService] Live fetching & saving job details for Job ID '{job_id}'...")
            details = await self.get_job_description(job_id)
            if details and details.get("job_id"):
                try:
                    db.save_job_description(details)
                    logger.info(f"[LinkedInService] Successfully saved job description for '{job_id}' into DB.")
                except Exception as e:
                    logger.warning(f"[LinkedInService] Failed to save job '{job_id}' to DB: {e}")
            return details
        except Exception as e:
            logger.error(f"[LinkedInService] Error processing job '{job_id}': {e}")
            return None

    async def save_job_details_bulk(self, job_ids: List[str], max_concurrency: int = 5) -> None:
        """
        Accepts a list of job IDs, concurrently fetches job details/descriptions, and saves them to the DB.
        """
        if not job_ids:
            return

        unique_ids = list(dict.fromkeys(str(j) for j in job_ids if j))
        logger.info(f"[LinkedInService] Kicking off bulk processing & DB saving for {len(unique_ids)} Job ID(s)...")

        semaphore = asyncio.Semaphore(max_concurrency)

        async def worker(jid: str):
            async with semaphore:
                service_instance = LinkedInService()
                try:
                    await service_instance.process_single_job_and_save(jid)
                finally:
                    await service_instance.close()

        tasks = [worker(jid) for jid in unique_ids]
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"[LinkedInService] Bulk processing completed for {len(unique_ids)} Job ID(s).")
