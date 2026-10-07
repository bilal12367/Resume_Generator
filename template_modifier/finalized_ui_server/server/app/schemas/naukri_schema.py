from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

class NaukriSearchRequest(BaseModel):
    keywords: Union[str, List[str]] = Field(default="Software Engineer", description="Search keywords or job titles")
    location: Optional[str] = Field(default="", description="Job location(s) e.g. Bangalore, Remote, Delhi")
    experience: Optional[Union[str, int]] = Field(default="", description="Experience level in years (e.g. 0, 2, 5)")
    pageNo: int = Field(default=1, ge=1, description="Page number for pagination")
    offset: int = Field(default=0, ge=0, description="Starting search offset")
    limit: int = Field(default=10, ge=1, le=50, description="Number of results to return")

class NaukriJobCard(BaseModel):
    job_id: str
    company_name: str
    location: str
    title: Optional[str] = ""
    experience: Optional[str] = ""
    posted_date: Optional[str] = ""
    posted_time: Optional[str] = ""
    job_url: Optional[str] = ""
    job_source: str = "naukri"

class NaukriSearchResponse(BaseModel):
    count: int
    offset: int
    limit: int
    jobs: List[Dict[str, Any]]

class NaukriJobDetailResponse(BaseModel):
    job_id: str
    title: str
    company_name: str
    location: str
    posted_time: str
    num_applicants: Optional[str] = ""
    seniority_level: Optional[str] = ""
    employment_type: Optional[str] = ""
    job_function: Optional[str] = ""
    industries: Optional[str] = ""
    minimal_description: str
    raw_description: str
    skills_required: List[str]
    job_url: str
    job_source: str = "naukri"
