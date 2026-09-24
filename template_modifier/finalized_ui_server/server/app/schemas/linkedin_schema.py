from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any

class LinkedInSearchRequest(BaseModel):
    keywords: Union[str, List[str]] = Field(default="Software Engineer", description="Search keywords or job titles")
    locations: Union[str, List[str]] = Field(default="Remote", description="Job location(s)")
    experience_level: Optional[str] = Field(default="", description="Seniority/experience level filter")
    posted_within: Optional[Union[str, int]] = Field(default=None, description="Time filter (e.g. '24h', '1d', '7d')")
    offset: int = Field(default=0, ge=0, description="Starting search offset")
    limit: int = Field(default=10, ge=1, le=50, description="Number of results to return")

class LinkedInJobCard(BaseModel):
    job_id: str
    company_name: str
    location: str
    title: Optional[str] = ""
    job_url: Optional[str] = ""

class LinkedInSearchResponse(BaseModel):
    count: int
    offset: int
    limit: int
    jobs: List[Dict[str, Any]]

class LinkedInJobDetailResponse(BaseModel):
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

class JobAgentChatRequest(BaseModel):
    session_id: Optional[str] = Field(default=None, description="Optional session ID to resume chat history")
    message: str = Field(..., description="User chat message to the Job Search Agent")

class JobAgentChatResponse(BaseModel):
    session_id: str
    response: str
    status: str
    token_usage: Dict[str, int]
    events: List[Dict[str, Any]]

